import { Vault } from "obsidian";
import { SyncAction } from "../types";
import { GitHubAPI } from "../github/GitHubAPI";
import { base64ToArrayBuffer } from "../utils/base64";
import { Logger } from "../utils/logger";

export class ConflictResolver {
	private vault: Vault;
	private api: GitHubAPI;
	private logger: Logger;

	constructor(vault: Vault, api: GitHubAPI, logger: Logger) {
		this.vault = vault;
		this.api = api;
		this.logger = logger;
	}

	async resolveConflicts(conflicts: SyncAction[]): Promise<SyncAction[]> {
		const uploadActions: SyncAction[] = [];

		for (const conflict of conflicts) {
			if (!conflict.remoteSha) continue;

			try {
				// Download remote version
				const blob = await this.api.getBlob(conflict.remoteSha);
				const content = base64ToArrayBuffer(
					blob.content.replace(/\n/g, ""),
				);

				// Save remote version as conflict copy
				const conflictPath = this.getConflictPath(conflict.path);
				await this.ensureParentDir(conflictPath);
				await this.vault.adapter.writeBinary(conflictPath, content);

				this.logger.info(
					`Conflict: ${conflict.path} → remote saved as ${conflictPath}`,
				);

				// Local version stays, mark for upload
				uploadActions.push({ type: "upload", path: conflict.path });
			} catch (err) {
				this.logger.error(
					`Failed to resolve conflict for ${conflict.path}:`,
					err,
				);
			}
		}

		return uploadActions;
	}

	getConflictPaths(conflicts: SyncAction[]): string[] {
		return conflicts.map((c) => this.getConflictPath(c.path));
	}

	private getConflictPath(path: string): string {
		const now = new Date();
		const ts =
			now.getFullYear().toString() +
			(now.getMonth() + 1).toString().padStart(2, "0") +
			now.getDate().toString().padStart(2, "0") +
			"-" +
			now.getHours().toString().padStart(2, "0") +
			now.getMinutes().toString().padStart(2, "0") +
			now.getSeconds().toString().padStart(2, "0");

		const lastDot = path.lastIndexOf(".");
		if (lastDot === -1) {
			return `${path}.conflict-${ts}`;
		}
		return `${path.substring(0, lastDot)}.conflict-${ts}${path.substring(lastDot)}`;
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
}
