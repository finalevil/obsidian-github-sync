import { Vault, Notice } from "obsidian";
import { Settings, SyncAction, RemoteFileEntry } from "../types";
import { GitHubAPI, GitHubError } from "../github/GitHubAPI";
import { BatchCommitter } from "../github/BatchCommitter";
import { StateManager } from "../state/StateManager";
import { IgnoreFilter } from "../state/IgnoreFilter";
import { DiffEngine } from "./DiffEngine";
import { ConflictResolver } from "./ConflictResolver";
import {
	base64ToArrayBuffer,
	arrayBufferToBase64,
} from "../utils/base64";
import { computeGitBlobSha } from "../utils/sha1";
import { Logger } from "../utils/logger";
import { unzipSync } from "fflate";

export type SyncStatus = "idle" | "syncing" | "error" | "up-to-date";

export class SyncManager {
	private vault: Vault;
	private api: GitHubAPI;
	private batchCommitter: BatchCommitter;
	private stateManager: StateManager;
	private diffEngine: DiffEngine;
	private conflictResolver: ConflictResolver;
	private ignoreFilter: IgnoreFilter;
	private logger: Logger;
	private settings: Settings;
	private locked = false;
	private _status: SyncStatus = "idle";
	private onStatusChange?: (status: SyncStatus) => void;

	constructor(
		vault: Vault,
		api: GitHubAPI,
		stateManager: StateManager,
		settings: Settings,
		logger: Logger,
		onStatusChange?: (status: SyncStatus) => void,
	) {
		this.vault = vault;
		this.api = api;
		this.stateManager = stateManager;
		this.settings = settings;
		this.logger = logger;
		this.onStatusChange = onStatusChange;
		this.ignoreFilter = new IgnoreFilter(settings.ignoredPatterns);
		this.diffEngine = new DiffEngine(logger, this.ignoreFilter);
		this.conflictResolver = new ConflictResolver(vault, api, logger);
		this.batchCommitter = new BatchCommitter(api, logger);
	}

	get status(): SyncStatus {
		return this._status;
	}

	private setStatus(status: SyncStatus): void {
		this._status = status;
		this.onStatusChange?.(status);
	}

	updateSettings(settings: Settings): void {
		this.settings = settings;
		this.ignoreFilter.updatePatterns(settings.ignoredPatterns);
	}

	async sync(): Promise<void> {
		if (this.locked) {
			this.logger.warn("Sync already in progress, skipping");
			return;
		}

		if (!this.settings.githubToken || !this.settings.githubRepo) {
			this.logger.warn("GitHub token or repo not configured");
			return;
		}

		this.locked = true;
		this.setStatus("syncing");

		try {
			if (!this.stateManager.hasState()) {
				await this.firstSync();
			} else {
				await this.fullSync();
			}
		} catch (err) {
			this.setStatus("error");
			this.handleSyncError(err);
		} finally {
			this.locked = false;
		}
	}

	async forceFullSync(): Promise<void> {
		if (this.locked) {
			this.logger.warn("Sync already in progress");
			return;
		}

		this.locked = true;
		this.setStatus("syncing");

		try {
			await this.initialClone();
		} catch (err) {
			this.setStatus("error");
			this.handleSyncError(err);
		} finally {
			this.locked = false;
		}
	}

	private async firstSync(): Promise<void> {
		// Detect if repo has commits or is empty
		let repoEmpty = false;
		try {
			await this.api.getLatestCommit();
		} catch (err) {
			if (
				err instanceof GitHubError &&
				(err.type === "empty_repo" || err.type === "conflict")
			) {
				repoEmpty = true;
			} else {
				throw err;
			}
		}

		if (repoEmpty) {
			await this.initialPush();
		} else {
			await this.initialClone();
		}
	}

	private async initialPush(): Promise<void> {
		this.logger.info("Empty repo, performing initial push...");
		new Notice("GitHub Sync: 正在上傳至 GitHub...");

		const localFiles = this.getLocalFilesInfo();
		const files: Array<{ path: string; content: ArrayBuffer }> = [];

		for (const info of localFiles) {
			if (info.sizeBytes > 100 * 1024 * 1024) {
				this.logger.warn(
					`Skipping large file: ${info.path}`,
				);
				continue;
			}
			try {
				const content = await this.vault.adapter.readBinary(
					info.path,
				);
				files.push({ path: info.path, content });
			} catch (err) {
				this.logger.error(
					`Failed to read ${info.path}:`,
					err,
				);
			}
		}

		if (files.length === 0) {
			this.logger.info("No files to push");
			this.setStatus("up-to-date");
			return;
		}

		// Create blobs in batches of 3 with delay
		const blobResults: Array<{ path: string; sha: string }> = [];
		for (let i = 0; i < files.length; i += 3) {
			if (i > 0) await this.sleep(500);
			const batch = files.slice(i, i + 3);
			const results = await Promise.all(
				batch.map(async (file) => {
					const b64 = arrayBufferToBase64(file.content);
					const sha = await this.api.createBlob(
						b64,
						"base64",
					);
					return { path: file.path, sha };
				}),
			);
			blobResults.push(...results);
			this.logger.debug(
				`Blobs: ${blobResults.length}/${files.length}`,
			);
		}

		// Create tree (no base_tree for first commit)
		const treeItems = blobResults.map((b) => ({
			path: b.path,
			mode: "100644" as const,
			type: "blob" as const,
			sha: b.sha as string | null,
		}));
		const treeSha = await this.api.createTree(treeItems);

		// Create commit (no parents for first commit)
		const message = this.settings.commitMessageTemplate.replace(
			"{{date}}",
			new Date().toISOString().split("T")[0],
		);
		const commitSha = await this.api.createCommit(message, treeSha, []);

		// Create ref (not update, since branch doesn't exist yet)
		await this.api.createRef(commitSha);

		// Build manifest
		for (const blob of blobResults) {
			const stat = await this.vault.adapter.stat(blob.path);
			if (stat) {
				this.stateManager.updateManifest(blob.path, {
					remoteSha: blob.sha,
					localMtimeMs: stat.mtime,
					localSizeBytes: stat.size,
				});
			}
		}

		this.stateManager.setLastSyncedCommitSha(commitSha);
		this.stateManager.setLastSyncTimestamp(Date.now());
		await this.stateManager.save();

		this.logger.info(`Initial push complete: ${files.length} files`);
		new Notice(
			`GitHub Sync: 上傳完成 (${files.length} 個檔案)`,
		);
		this.setStatus("up-to-date");
	}

	private async fullSync(retryCount = 0): Promise<void> {
		// Step 1: Get remote state
		const latestCommit = await this.api.getLatestCommit();
		const remoteTree = await this.api.getTree(latestCommit.treeSha);

		// Step 2: Get local files info
		const localFiles = this.getLocalFilesInfo();

		// Step 3: Compute diff
		const plan = this.diffEngine.computeSyncPlan(
			remoteTree,
			this.stateManager.getManifest(),
			localFiles,
			latestCommit.sha,
		);

		if (plan.actions.length === 0) {
			this.logger.info("Everything up to date");
			this.stateManager.setLastSyncedCommitSha(latestCommit.sha);
			this.stateManager.setLastSyncTimestamp(Date.now());
			await this.stateManager.save();
			this.setStatus("up-to-date");
			return;
		}

		// Step 4: Download remote changes
		const downloads = plan.actions.filter((a) => a.type === "download");
		if (downloads.length > 0) {
			await this.downloadFiles(downloads, remoteTree);
		}

		// Step 5: Handle conflicts
		const conflicts = plan.actions.filter((a) => a.type === "conflict");
		let extraUploads: SyncAction[] = [];
		if (conflicts.length > 0) {
			new Notice(
				`GitHub Sync: ${conflicts.length} 個衝突已建立副本`,
			);
			extraUploads =
				await this.conflictResolver.resolveConflicts(conflicts);
		}

		// Step 6: Delete local files removed from remote
		const localDeletes = plan.actions.filter(
			(a) => a.type === "delete_local",
		);
		for (const action of localDeletes) {
			try {
				await this.vault.adapter.remove(action.path);
				this.stateManager.removeFromManifest(action.path);
				this.logger.debug(`Deleted local: ${action.path}`);
			} catch (err) {
				this.logger.warn(
					`Failed to delete ${action.path}:`,
					err,
				);
			}
		}

		// Step 7: Upload local changes
		const uploads = [
			...plan.actions.filter((a) => a.type === "upload"),
			...extraUploads,
		];

		if (uploads.length > 0) {
			try {
				await this.uploadFiles(uploads);
			} catch (err) {
				if (
					err instanceof GitHubError &&
					err.type === "conflict" &&
					retryCount < 3
				) {
					this.logger.warn(
						`Ref update conflict, retrying (${retryCount + 1}/3)...`,
					);
					await this.fullSync(retryCount + 1);
					return;
				}
				throw err;
			}
		}

		// Step 8: Update state
		const finalCommit = await this.api.getLatestCommit();
		this.stateManager.setLastSyncedCommitSha(finalCommit.sha);
		this.stateManager.setLastSyncTimestamp(Date.now());
		await this.stateManager.save();

		const total =
			downloads.length +
			uploads.length +
			conflicts.length +
			localDeletes.length;
		this.logger.info(`Sync complete: ${total} actions`);
		new Notice(`GitHub Sync: 同步完成 (${total} 個變更)`);
		this.setStatus("up-to-date");
	}

	private async downloadFiles(
		actions: SyncAction[],
		remoteTree: RemoteFileEntry[],
	): Promise<void> {
		const remoteMap = new Map(remoteTree.map((e) => [e.path, e]));

		for (let i = 0; i < actions.length; i += 3) {
			if (i > 0) await this.sleep(500);
			const batch = actions.slice(i, i + 3);
			await Promise.all(
				batch.map(async (action) => {
					const sha =
						action.remoteSha ||
						remoteMap.get(action.path)?.sha;
					if (!sha) return;

					try {
						const blob = await this.api.getBlob(sha);
						const content = base64ToArrayBuffer(
							blob.content.replace(/\n/g, ""),
						);

						await this.ensureParentDir(action.path);
						await this.vault.adapter.writeBinary(
							action.path,
							content,
						);

						const stat = await this.vault.adapter.stat(
							action.path,
						);
						if (stat) {
							this.stateManager.updateManifest(action.path, {
								remoteSha: sha,
								localMtimeMs: stat.mtime,
								localSizeBytes: stat.size,
							});
						}

						this.logger.debug(`Downloaded: ${action.path}`);
					} catch (err) {
						this.logger.error(
							`Failed to download ${action.path}:`,
							err,
						);
					}
				}),
			);
		}
	}

	private async uploadFiles(actions: SyncAction[]): Promise<void> {
		const files: Array<{ path: string; content: ArrayBuffer }> = [];
		for (const action of actions) {
			try {
				// Skip files > 100MB
				const stat = await this.vault.adapter.stat(action.path);
				if (stat && stat.size > 100 * 1024 * 1024) {
					this.logger.warn(
						`Skipping large file: ${action.path} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`,
					);
					continue;
				}
				const content = await this.vault.adapter.readBinary(
					action.path,
				);
				files.push({ path: action.path, content });
			} catch (err) {
				this.logger.error(
					`Failed to read ${action.path} for upload:`,
					err,
				);
			}
		}

		if (files.length === 0) return;

		const message = this.settings.commitMessageTemplate.replace(
			"{{date}}",
			new Date().toISOString().split("T")[0],
		);

		await this.batchCommitter.commit(files, [], message);

		// Update manifest for uploaded files
		for (const file of files) {
			const sha = await computeGitBlobSha(file.content);
			const stat = await this.vault.adapter.stat(file.path);
			if (stat) {
				this.stateManager.updateManifest(file.path, {
					remoteSha: sha,
					localMtimeMs: stat.mtime,
					localSizeBytes: stat.size,
				});
			}
		}
	}

	async initialClone(): Promise<void> {
		this.logger.info("Starting initial clone...");
		new Notice("GitHub Sync: 正在從 GitHub 下載...");

		// Step 1: Download zipball
		const zipData = await this.api.downloadZipball();
		this.logger.info(
			`Downloaded zipball: ${(zipData.byteLength / 1024 / 1024).toFixed(1)}MB`,
		);

		// Step 2: Unzip
		const zipArray = new Uint8Array(zipData);
		const unzipped = unzipSync(zipArray);

		// Step 3: Strip top-level directory and write files
		let topDir = "";
		const paths = Object.keys(unzipped);
		if (paths.length > 0) {
			const first = paths[0];
			topDir = first.substring(0, first.indexOf("/") + 1);
		}

		let fileCount = 0;
		for (const [zipPath, data] of Object.entries(unzipped)) {
			let relativePath = zipPath;
			if (topDir && zipPath.startsWith(topDir)) {
				relativePath = zipPath.substring(topDir.length);
			}

			if (!relativePath || relativePath.endsWith("/")) continue;
			if (this.ignoreFilter.shouldIgnore(relativePath)) continue;
			if (data.byteLength > 100 * 1024 * 1024) {
				this.logger.warn(
					`Skipping large file: ${relativePath} (${(data.byteLength / 1024 / 1024).toFixed(1)}MB)`,
				);
				continue;
			}

			await this.ensureParentDir(relativePath);
			const buffer = new Uint8Array(data).buffer;
			await this.vault.adapter.writeBinary(relativePath, buffer);
			fileCount++;
		}

		this.logger.info(`Extracted ${fileCount} files`);

		// Step 4: Get full tree for SHA values
		const latestCommit = await this.api.getLatestCommit();
		const remoteTree = await this.api.getTree(latestCommit.treeSha);

		// Step 5: Build initial manifest
		for (const entry of remoteTree) {
			if (this.ignoreFilter.shouldIgnore(entry.path)) continue;

			try {
				const stat = await this.vault.adapter.stat(entry.path);
				if (stat) {
					this.stateManager.updateManifest(entry.path, {
						remoteSha: entry.sha,
						localMtimeMs: stat.mtime,
						localSizeBytes: stat.size,
					});
				}
			} catch {
				// File might not exist locally
			}
		}

		// Step 6: Save state
		this.stateManager.setLastSyncedCommitSha(latestCommit.sha);
		this.stateManager.setLastSyncTimestamp(Date.now());
		await this.stateManager.save();

		this.logger.info("Initial clone complete");
		new Notice(`GitHub Sync: 下載完成 (${fileCount} 個檔案)`);
		this.setStatus("up-to-date");
	}

	private getLocalFilesInfo(): Array<{
		path: string;
		mtimeMs: number;
		sizeBytes: number;
	}> {
		const files = this.vault.getFiles();
		const result: Array<{
			path: string;
			mtimeMs: number;
			sizeBytes: number;
		}> = [];

		for (const file of files) {
			if (this.ignoreFilter.shouldIgnore(file.path)) continue;
			result.push({
				path: file.path,
				mtimeMs: file.stat.mtime,
				sizeBytes: file.stat.size,
			});
		}

		return result;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async ensureParentDir(path: string): Promise<void> {
		const dir = path.substring(0, path.lastIndexOf("/"));
		if (dir) {
			const exists = await this.vault.adapter.exists(dir);
			if (!exists) {
				await this.vault.adapter.mkdir(dir);
			}
		}
	}

	private handleSyncError(err: unknown): void {
		if (err instanceof GitHubError) {
			switch (err.type) {
				case "auth":
					new Notice("GitHub Sync: 認證失敗，請檢查 Token");
					break;
				case "forbidden":
					new Notice(
						"GitHub Sync: 權限不足，請確認 Token 有 repo scope",
					);
					break;
				case "rate_limit":
					new Notice("GitHub Sync: API 速率限制，稍後重試");
					break;
				case "not_found":
					new Notice(
						"GitHub Sync: 找不到 Repo，請檢查設定",
					);
					break;
				case "server":
					new Notice(
						"GitHub Sync: GitHub 伺服器錯誤，稍後重試",
					);
					break;
				default:
					new Notice(
						`GitHub Sync: 同步失敗 - ${err.message}`,
					);
			}
		} else {
			new Notice("GitHub Sync: 同步失敗");
		}
		this.logger.error("Sync error:", err);
	}
}
