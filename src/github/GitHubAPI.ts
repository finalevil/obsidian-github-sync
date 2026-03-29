import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import { RemoteFileEntry, RateLimitInfo } from "../types";
import { Logger } from "../utils/logger";

export type GitHubErrorType =
	| "auth"
	| "forbidden"
	| "rate_limit"
	| "not_found"
	| "conflict"
	| "empty_repo"
	| "server"
	| "unknown";

export class GitHubError extends Error {
	status: number;
	type: GitHubErrorType;
	retryable: boolean;

	constructor(
		message: string,
		status: number,
		type: GitHubErrorType,
		retryable = false,
	) {
		super(message);
		this.name = "GitHubError";
		this.status = status;
		this.type = type;
		this.retryable = retryable;
	}
}

export class GitHubAPI {
	private token: string;
	private repo: string;
	private branch: string;
	private logger: Logger;
	rateLimit: RateLimitInfo = {
		remaining: 5000,
		limit: 5000,
		resetTimestamp: 0,
	};

	constructor(token: string, repo: string, branch: string, logger: Logger) {
		this.token = token;
		this.repo = repo;
		this.branch = branch;
		this.logger = logger;
	}

	updateConfig(token: string, repo: string, branch: string): void {
		this.token = token;
		this.repo = repo;
		this.branch = branch;
	}

	private get baseUrl(): string {
		return `https://api.github.com/repos/${this.repo}`;
	}

	private async request(
		path: string,
		options: Partial<RequestUrlParam> = {},
		retryCount = 0,
	): Promise<RequestUrlResponse> {
		const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
		this.logger.debug(`API ${options.method || "GET"} ${path}`);

		const response = await requestUrl({
			url,
			method: options.method || "GET",
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				...(options.headers as Record<string, string>),
			},
			body: options.body,
			throw: false,
		});

		// Track rate limit from response headers
		const remaining = response.headers["x-ratelimit-remaining"];
		const limit = response.headers["x-ratelimit-limit"];
		const reset = response.headers["x-ratelimit-reset"];
		if (remaining) this.rateLimit.remaining = parseInt(remaining);
		if (limit) this.rateLimit.limit = parseInt(limit);
		if (reset) this.rateLimit.resetTimestamp = parseInt(reset) * 1000;

		// Retry on rate limit and server errors
		if (
			(response.status === 403 || response.status === 429 || response.status >= 500) &&
			retryCount < 3
		) {
			const isRateLimit =
				response.status === 429 ||
				this.isSecondaryRateLimit(response);

			if (isRateLimit || response.status >= 500) {
				const retryAfter = response.headers["retry-after"];
				const waitMs = retryAfter
					? parseInt(retryAfter) * 1000
					: Math.min(1000 * Math.pow(2, retryCount + 1), 60000);

				this.logger.warn(
					`Rate limit / server error, retrying in ${waitMs / 1000}s (${retryCount + 1}/3)`,
				);
				await this.sleep(waitMs);
				return this.request(path, options, retryCount + 1);
			}
		}

		if (response.status >= 400) {
			this.throwError(response);
		}

		return response;
	}

	private isSecondaryRateLimit(response: RequestUrlResponse): boolean {
		try {
			const body = response.json;
			if (
				body?.message &&
				typeof body.message === "string" &&
				body.message.toLowerCase().includes("rate limit")
			) {
				return true;
			}
		} catch {
			// ignore
		}
		return false;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private throwError(response: RequestUrlResponse): never {
		const status = response.status;
		let message = `GitHub API error ${status}`;

		try {
			const body = response.json;
			if (body?.message) {
				message += `: ${body.message}`;
			}
		} catch {
			// ignore parse error
		}

		if (status === 401) {
			throw new GitHubError(message, status, "auth");
		} else if (status === 403) {
			if (
				this.rateLimit.remaining === 0 ||
				this.isSecondaryRateLimit(response)
			) {
				throw new GitHubError(message, status, "rate_limit", true);
			}
			throw new GitHubError(message, status, "forbidden");
		} else if (status === 429) {
			throw new GitHubError(message, status, "rate_limit", true);
		} else if (status === 404) {
			throw new GitHubError(message, status, "not_found");
		} else if (status === 409) {
			throw new GitHubError(message, status, "empty_repo");
		} else if (status === 422) {
			throw new GitHubError(message, status, "conflict");
		} else if (status >= 500) {
			throw new GitHubError(message, status, "server", true);
		}
		throw new GitHubError(message, status, "unknown");
	}

	async testConnection(): Promise<{ name: string; private: boolean }> {
		const resp = await this.request("");
		return { name: resp.json.full_name, private: resp.json.private };
	}

	async getLatestCommit(): Promise<{
		sha: string;
		treeSha: string;
		message: string;
	}> {
		const resp = await this.request(
			`/commits?sha=${encodeURIComponent(this.branch)}&per_page=1`,
		);
		const commit = resp.json[0];
		return {
			sha: commit.sha,
			treeSha: commit.commit.tree.sha,
			message: commit.commit.message,
		};
	}

	async getTree(
		sha: string,
		recursive = true,
	): Promise<RemoteFileEntry[]> {
		const resp = await this.request(
			`/git/trees/${sha}${recursive ? "?recursive=1" : ""}`,
		);
		return (
			resp.json.tree as Array<{
				path: string;
				sha: string;
				size?: number;
				type: string;
			}>
		)
			.filter((item) => item.type === "blob")
			.map((item) => ({
				path: item.path,
				sha: item.sha,
				size: item.size || 0,
				type: "blob" as const,
			}));
	}

	async getBlob(
		sha: string,
	): Promise<{ content: string; encoding: string; size: number }> {
		const resp = await this.request(`/git/blobs/${sha}`);
		return {
			content: resp.json.content,
			encoding: resp.json.encoding,
			size: resp.json.size,
		};
	}

	async createBlob(
		content: string,
		encoding: "utf-8" | "base64",
	): Promise<string> {
		const resp = await this.request("/git/blobs", {
			method: "POST",
			body: JSON.stringify({ content, encoding }),
		});
		return resp.json.sha;
	}

	async createTree(
		treeItems: Array<{
			path: string;
			mode: string;
			type: string;
			sha: string | null;
		}>,
		baseTree?: string,
	): Promise<string> {
		const body: Record<string, unknown> = { tree: treeItems };
		if (baseTree) {
			body.base_tree = baseTree;
		}
		const resp = await this.request("/git/trees", {
			method: "POST",
			body: JSON.stringify(body),
		});
		return resp.json.sha;
	}

	async createCommit(
		message: string,
		tree: string,
		parents: string[],
	): Promise<string> {
		const resp = await this.request("/git/commits", {
			method: "POST",
			body: JSON.stringify({ message, tree, parents }),
		});
		return resp.json.sha;
	}

	async updateRef(sha: string, force = false): Promise<void> {
		await this.request(
			`/git/refs/heads/${encodeURIComponent(this.branch)}`,
			{
				method: "PATCH",
				body: JSON.stringify({ sha, force }),
			},
		);
	}

	async createRef(sha: string): Promise<void> {
		await this.request("/git/refs", {
			method: "POST",
			body: JSON.stringify({
				ref: `refs/heads/${this.branch}`,
				sha,
			}),
		});
	}

	async downloadZipball(): Promise<ArrayBuffer> {
		const resp = await requestUrl({
			url: `${this.baseUrl}/zipball/${encodeURIComponent(this.branch)}`,
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: "application/vnd.github+json",
			},
		});
		return resp.arrayBuffer;
	}
}
