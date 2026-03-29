import { Plugin, Notice, EventRef } from "obsidian";
import { Settings, DEFAULT_SETTINGS } from "./types";
import { Logger } from "./utils/logger";
import { GitHubAPI } from "./github/GitHubAPI";
import { StateManager } from "./state/StateManager";
import { SyncManager, SyncStatus } from "./sync/SyncManager";
import { SettingsTab } from "./ui/SettingsTab";
import { StatusBar } from "./ui/StatusBar";
import { ConflictModal } from "./ui/ConflictModal";
import { debounce } from "./utils/debounce";

export default class GitHubSyncPlugin extends Plugin {
	settings: Settings = DEFAULT_SETTINGS;
	logger: Logger = new Logger(false);
	api: GitHubAPI = new GitHubAPI("", "", "main", this.logger);
	stateManager: StateManager = new StateManager(this, this.logger);
	syncManager!: SyncManager;
	private statusBar!: StatusBar;
	private debouncedSync: (() => void) & { cancel: () => void } =
		Object.assign(() => {}, { cancel: () => {} });
	private periodicSyncInterval: number | null = null;
	private fileEventRefs: EventRef[] = [];

	async onload(): Promise<void> {
		await this.loadSettings();

		this.logger = new Logger(this.settings.debugLogging);
		this.api = new GitHubAPI(
			this.settings.githubToken,
			this.settings.githubRepo,
			this.settings.githubBranch,
			this.logger,
		);
		this.stateManager = new StateManager(this, this.logger);
		await this.stateManager.load();

		this.syncManager = new SyncManager(
			this.app.vault,
			this.api,
			this.stateManager,
			this.settings,
			this.logger,
			(status) => this.onSyncStatusChange(status),
		);

		// Settings tab
		this.addSettingTab(new SettingsTab(this.app, this));

		// Status bar
		const statusBarEl = this.addStatusBarItem();
		this.statusBar = new StatusBar(statusBarEl, () =>
			this.syncManager.sync(),
		);

		// Commands
		this.addCommand({
			id: "sync-now",
			name: "立即同步",
			callback: () => this.syncManager.sync(),
		});

		this.addCommand({
			id: "force-full-sync",
			name: "強制完整同步",
			callback: () => this.syncManager.forceFullSync(),
		});

		// Ribbon icon
		this.addRibbonIcon("refresh-cw", "GitHub Sync", () => {
			this.syncManager.sync();
		});

		// Auto sync on layout ready
		this.app.workspace.onLayoutReady(() => {
			if (
				this.settings.syncOnOpen &&
				this.settings.githubToken &&
				this.settings.githubRepo
			) {
				this.syncManager.sync();
			}
			this.setupAutoSync();
		});

		this.logger.info("Plugin loaded");
	}

	onunload(): void {
		this.debouncedSync.cancel();
		this.cleanupEventListeners();
		if (this.periodicSyncInterval !== null) {
			window.clearInterval(this.periodicSyncInterval);
		}
		this.logger.info("Plugin unloaded");
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.syncManager?.updateSettings(this.settings);
		this.updateAPIConfig();
	}

	updateAPIConfig(): void {
		this.api.updateConfig(
			this.settings.githubToken,
			this.settings.githubRepo,
			this.settings.githubBranch,
		);
	}

	setupAutoSync(): void {
		// Cleanup existing
		this.debouncedSync.cancel();
		this.cleanupEventListeners();
		if (this.periodicSyncInterval !== null) {
			window.clearInterval(this.periodicSyncInterval);
			this.periodicSyncInterval = null;
		}

		if (!this.settings.autoSyncEnabled) return;

		// File change listeners with debounce
		if (this.settings.syncOnChange) {
			this.debouncedSync = debounce(
				() => this.syncManager.sync(),
				this.settings.debounceSeconds * 1000,
			);

			const handler = () => this.debouncedSync();
			for (const ref of [
				this.app.vault.on("modify", handler),
				this.app.vault.on("create", handler),
				this.app.vault.on("delete", handler),
				this.app.vault.on("rename", handler),
			]) {
				this.fileEventRefs.push(ref);
				this.registerEvent(ref);
			}
		}

		// Periodic sync
		if (this.settings.periodicSyncEnabled) {
			this.periodicSyncInterval = window.setInterval(
				() => this.syncManager.sync(),
				this.settings.periodicSyncMinutes * 60 * 1000,
			);
			this.register(() => {
				if (this.periodicSyncInterval !== null) {
					window.clearInterval(this.periodicSyncInterval);
				}
			});
		}
	}

	private cleanupEventListeners(): void {
		for (const ref of this.fileEventRefs) {
			this.app.vault.offref(ref);
		}
		this.fileEventRefs = [];
	}

	private onSyncStatusChange(status: SyncStatus): void {
		this.statusBar?.update(
			status,
			this.stateManager.getLastSyncTimestamp(),
		);
	}
}
