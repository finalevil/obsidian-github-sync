export interface Settings {
	githubToken: string;
	githubRepo: string;
	githubBranch: string;
	autoSyncEnabled: boolean;
	syncOnOpen: boolean;
	syncOnChange: boolean;
	debounceSeconds: number;
	periodicSyncEnabled: boolean;
	periodicSyncMinutes: number;
	commitMessageTemplate: string;
	ignoredPatterns: string[];
	debugLogging: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
	githubToken: "",
	githubRepo: "",
	githubBranch: "main",
	autoSyncEnabled: true,
	syncOnOpen: true,
	syncOnChange: true,
	debounceSeconds: 30,
	periodicSyncEnabled: true,
	periodicSyncMinutes: 5,
	commitMessageTemplate: "vault sync: {{date}}",
	ignoredPatterns: [
		".obsidian/workspace.json",
		".obsidian/workspace-mobile.json",
		".DS_Store",
	],
	debugLogging: false,
};

export interface FileManifestEntry {
	remoteSha: string;
	localMtimeMs: number;
	localSizeBytes: number;
}

export interface SyncState {
	lastSyncedCommitSha: string;
	lastSyncTimestamp: number;
	manifest: Record<string, FileManifestEntry>;
}

export type SyncActionType =
	| "download"
	| "upload"
	| "delete_local"
	| "conflict";

export interface SyncAction {
	type: SyncActionType;
	path: string;
	remoteSha?: string;
}

export interface SyncPlan {
	actions: SyncAction[];
	remoteCommitSha: string;
}

export interface RemoteFileEntry {
	path: string;
	sha: string;
	size: number;
	type: "blob" | "tree";
}

export interface RateLimitInfo {
	remaining: number;
	limit: number;
	resetTimestamp: number;
}
