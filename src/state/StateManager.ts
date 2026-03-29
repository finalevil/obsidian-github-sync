import { Plugin } from "obsidian";
import { SyncState, FileManifestEntry } from "../types";
import { Logger } from "../utils/logger";

const STATE_FILE = "sync-state.json";

export class StateManager {
	private plugin: Plugin;
	private state: SyncState;
	private logger: Logger;

	constructor(plugin: Plugin, logger: Logger) {
		this.plugin = plugin;
		this.logger = logger;
		this.state = {
			lastSyncedCommitSha: "",
			lastSyncTimestamp: 0,
			manifest: {},
		};
	}

	private get statePath(): string {
		return `${this.plugin.manifest.dir}/${STATE_FILE}`;
	}

	async load(): Promise<void> {
		try {
			const data = await this.plugin.app.vault.adapter.read(
				this.statePath,
			);
			this.state = JSON.parse(data);
			this.logger.debug("State loaded", {
				entries: Object.keys(this.state.manifest).length,
			});
		} catch {
			this.logger.info("No existing state file, starting fresh");
			this.state = {
				lastSyncedCommitSha: "",
				lastSyncTimestamp: 0,
				manifest: {},
			};
		}
	}

	async save(): Promise<void> {
		const data = JSON.stringify(this.state, null, 2);
		await this.plugin.app.vault.adapter.write(this.statePath, data);
		this.logger.debug("State saved");
	}

	getManifest(): Record<string, FileManifestEntry> {
		return this.state.manifest;
	}

	getEntry(path: string): FileManifestEntry | undefined {
		return this.state.manifest[path];
	}

	updateManifest(path: string, entry: FileManifestEntry): void {
		this.state.manifest[path] = entry;
	}

	removeFromManifest(path: string): void {
		delete this.state.manifest[path];
	}

	getLastSyncedCommitSha(): string {
		return this.state.lastSyncedCommitSha;
	}

	setLastSyncedCommitSha(sha: string): void {
		this.state.lastSyncedCommitSha = sha;
	}

	getLastSyncTimestamp(): number {
		return this.state.lastSyncTimestamp;
	}

	setLastSyncTimestamp(timestamp: number): void {
		this.state.lastSyncTimestamp = timestamp;
	}

	hasState(): boolean {
		return this.state.lastSyncedCommitSha !== "";
	}
}
