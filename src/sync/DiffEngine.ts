import {
	FileManifestEntry,
	RemoteFileEntry,
	SyncAction,
	SyncPlan,
} from "../types";
import { IgnoreFilter } from "../state/IgnoreFilter";
import { Logger } from "../utils/logger";

interface LocalFileInfo {
	path: string;
	mtimeMs: number;
	sizeBytes: number;
}

export class DiffEngine {
	private logger: Logger;
	private ignoreFilter: IgnoreFilter;

	constructor(logger: Logger, ignoreFilter: IgnoreFilter) {
		this.logger = logger;
		this.ignoreFilter = ignoreFilter;
	}

	computeSyncPlan(
		remoteTree: RemoteFileEntry[],
		manifest: Record<string, FileManifestEntry>,
		localFiles: LocalFileInfo[],
		remoteCommitSha: string,
	): SyncPlan {
		const actions: SyncAction[] = [];

		// Build lookup maps
		const remoteMap = new Map<string, RemoteFileEntry>();
		for (const entry of remoteTree) {
			if (!this.ignoreFilter.shouldIgnore(entry.path)) {
				remoteMap.set(entry.path, entry);
			}
		}

		const localMap = new Map<string, LocalFileInfo>();
		for (const file of localFiles) {
			if (!this.ignoreFilter.shouldIgnore(file.path)) {
				localMap.set(file.path, file);
			}
		}

		// Check each remote file
		for (const [path, remote] of remoteMap) {
			const manifestEntry = manifest[path];
			const localFile = localMap.get(path);

			if (!manifestEntry) {
				if (!localFile) {
					// Remote new: in remote, not in manifest, not on disk
					actions.push({
						type: "download",
						path,
						remoteSha: remote.sha,
					});
				} else {
					// Both exist but not tracked — conflict
					actions.push({
						type: "conflict",
						path,
						remoteSha: remote.sha,
					});
				}
			} else {
				const remoteShaChanged =
					remote.sha !== manifestEntry.remoteSha;
				const localChanged = localFile
					? localFile.mtimeMs !== manifestEntry.localMtimeMs ||
						localFile.sizeBytes !== manifestEntry.localSizeBytes
					: false;

				if (remoteShaChanged && !localChanged) {
					// Remote modified
					actions.push({
						type: "download",
						path,
						remoteSha: remote.sha,
					});
				} else if (!remoteShaChanged && localChanged) {
					// Local modified
					actions.push({ type: "upload", path });
				} else if (remoteShaChanged && localChanged) {
					// Both changed — conflict
					actions.push({
						type: "conflict",
						path,
						remoteSha: remote.sha,
					});
				}
				// No change — skip
			}
		}

		// Check local-only files (not in remote)
		for (const [path, localFile] of localMap) {
			if (remoteMap.has(path)) continue;

			const manifestEntry = manifest[path];
			if (manifestEntry) {
				// Was tracked — remote deleted it
				const localChanged =
					localFile.mtimeMs !== manifestEntry.localMtimeMs ||
					localFile.sizeBytes !== manifestEntry.localSizeBytes;
				if (localChanged) {
					// Local modified + remote deleted → keep local, upload
					actions.push({ type: "upload", path });
				} else {
					// Remote deleted, local unchanged → delete local
					actions.push({ type: "delete_local", path });
				}
			} else {
				// Local new: not in remote, not in manifest
				actions.push({ type: "upload", path });
			}
		}

		this.logger.info(`Sync plan: ${actions.length} actions`, {
			download: actions.filter((a) => a.type === "download").length,
			upload: actions.filter((a) => a.type === "upload").length,
			deleteLocal: actions.filter((a) => a.type === "delete_local")
				.length,
			conflict: actions.filter((a) => a.type === "conflict").length,
		});

		return { actions, remoteCommitSha };
	}
}
