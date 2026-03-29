import { GitHubAPI } from "./GitHubAPI";
import { arrayBufferToBase64 } from "../utils/base64";
import { Logger } from "../utils/logger";

interface FileChange {
	path: string;
	content: ArrayBuffer;
}

export class BatchCommitter {
	private api: GitHubAPI;
	private logger: Logger;

	constructor(api: GitHubAPI, logger: Logger) {
		this.api = api;
		this.logger = logger;
	}

	async commit(
		files: FileChange[],
		deletedPaths: string[],
		message: string,
	): Promise<string> {
		const head = await this.api.getLatestCommit();

		// Step 1: Create blobs in parallel (batch of 10)
		this.logger.info(`Creating ${files.length} blobs...`);
		const blobResults: Array<{ path: string; sha: string }> = [];

		for (let i = 0; i < files.length; i += 10) {
			const batch = files.slice(i, i + 10);
			const results = await Promise.all(
				batch.map(async (file) => {
					const base64Content = arrayBufferToBase64(file.content);
					const sha = await this.api.createBlob(
						base64Content,
						"base64",
					);
					return { path: file.path, sha };
				}),
			);
			blobResults.push(...results);
		}

		// Step 2: Build tree items
		const treeItems: Array<{
			path: string;
			mode: string;
			type: string;
			sha: string | null;
		}> = [];

		for (const blob of blobResults) {
			treeItems.push({
				path: blob.path,
				mode: "100644",
				type: "blob",
				sha: blob.sha,
			});
		}

		for (const path of deletedPaths) {
			treeItems.push({
				path,
				mode: "100644",
				type: "blob",
				sha: null,
			});
		}

		// Step 3: Create tree with base_tree for incremental update
		this.logger.info("Creating tree...");
		const treeSha = await this.api.createTree(treeItems, head.treeSha);

		// Step 4: Create commit
		this.logger.info("Creating commit...");
		const commitSha = await this.api.createCommit(message, treeSha, [
			head.sha,
		]);

		// Step 5: Update ref (force: false for optimistic locking)
		this.logger.info("Updating ref...");
		await this.api.updateRef(commitSha, false);

		this.logger.info(`Commit created: ${commitSha.substring(0, 7)}`);
		return commitSha;
	}
}
