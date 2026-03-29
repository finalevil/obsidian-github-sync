import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type GitHubSyncPlugin from "../main";

export class SettingsTab extends PluginSettingTab {
	plugin: GitHubSyncPlugin;

	constructor(app: App, plugin: GitHubSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- Connection ---
		containerEl.createEl("h2", { text: "GitHub 連線設定" });

		new Setting(containerEl)
			.setName("GitHub Token")
			.setDesc("Personal Access Token（需要 repo scope）")
			.addText((text) =>
				text
					.setPlaceholder("ghp_...")
					.setValue(this.plugin.settings.githubToken)
					.then((t) => {
						t.inputEl.type = "password";
					})
					.onChange(async (value) => {
						this.plugin.settings.githubToken = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("GitHub Repo")
			.setDesc("格式：owner/repo-name")
			.addText((text) =>
				text
					.setPlaceholder("owner/repo")
					.setValue(this.plugin.settings.githubRepo)
					.onChange(async (value) => {
						this.plugin.settings.githubRepo = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Branch")
			.setDesc("要同步的分支")
			.addText((text) =>
				text
					.setPlaceholder("main")
					.setValue(this.plugin.settings.githubBranch)
					.onChange(async (value) => {
						this.plugin.settings.githubBranch = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("測試連線")
			.setDesc("驗證 Token 和 Repo 設定是否正確")
			.addButton((button) =>
				button.setButtonText("測試").onClick(async () => {
					button.setButtonText("測試中...");
					button.setDisabled(true);
					try {
						this.plugin.updateAPIConfig();
						const result =
							await this.plugin.api.testConnection();
						new Notice(`連線成功！Repo: ${result.name}`);
					} catch (err) {
						new Notice(
							`連線失敗: ${err instanceof Error ? err.message : "未知錯誤"}`,
						);
					} finally {
						button.setButtonText("測試");
						button.setDisabled(false);
					}
				}),
			);

		// --- Auto Sync ---
		containerEl.createEl("h2", { text: "自動同步" });

		new Setting(containerEl)
			.setName("啟用自動同步")
			.setDesc("自動偵測變更並同步")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSyncEnabled)
					.onChange(async (value) => {
						this.plugin.settings.autoSyncEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.setupAutoSync();
					}),
			);

		new Setting(containerEl)
			.setName("開啟時同步")
			.setDesc("Obsidian 開啟時自動從 GitHub 同步")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncOnOpen)
					.onChange(async (value) => {
						this.plugin.settings.syncOnOpen = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("變更時同步")
			.setDesc("檔案變更後自動同步到 GitHub")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncOnChange)
					.onChange(async (value) => {
						this.plugin.settings.syncOnChange = value;
						await this.plugin.saveSettings();
						this.plugin.setupAutoSync();
					}),
			);

		new Setting(containerEl)
			.setName("Debounce 秒數")
			.setDesc("檔案變更後等待多少秒再同步")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(
						String(this.plugin.settings.debounceSeconds),
					)
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.debounceSeconds = num;
							await this.plugin.saveSettings();
							this.plugin.setupAutoSync();
						}
					}),
			);

		new Setting(containerEl)
			.setName("定時同步")
			.setDesc("每隔固定時間自動同步")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.periodicSyncEnabled)
					.onChange(async (value) => {
						this.plugin.settings.periodicSyncEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.setupAutoSync();
					}),
			);

		new Setting(containerEl)
			.setName("同步間隔（分鐘）")
			.setDesc("定時同步的間隔")
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(
						String(
							this.plugin.settings.periodicSyncMinutes,
						),
					)
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num >= 1) {
							this.plugin.settings.periodicSyncMinutes =
								num;
							await this.plugin.saveSettings();
							this.plugin.setupAutoSync();
						}
					}),
			);

		// --- Advanced ---
		containerEl.createEl("h2", { text: "進階設定" });

		new Setting(containerEl)
			.setName("Commit 訊息範本")
			.setDesc("使用 {{date}} 作為日期佔位符")
			.addText((text) =>
				text
					.setPlaceholder("vault sync: {{date}}")
					.setValue(
						this.plugin.settings.commitMessageTemplate,
					)
					.onChange(async (value) => {
						this.plugin.settings.commitMessageTemplate =
							value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("忽略規則")
			.setDesc("每行一個 glob 規則，符合的檔案不會同步")
			.addTextArea((text) =>
				text
					.setPlaceholder(
						".obsidian/workspace.json\n*.tmp",
					)
					.setValue(
						this.plugin.settings.ignoredPatterns.join("\n"),
					)
					.then((t) => {
						t.inputEl.rows = 6;
						t.inputEl.cols = 40;
					})
					.onChange(async (value) => {
						this.plugin.settings.ignoredPatterns = value
							.split("\n")
							.map((l) => l.trim())
							.filter((l) => l.length > 0);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("除錯日誌")
			.setDesc("在開發者工具中顯示詳細日誌")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugLogging)
					.onChange(async (value) => {
						this.plugin.settings.debugLogging = value;
						await this.plugin.saveSettings();
						this.plugin.logger.setEnabled(value);
					}),
			);

		// Rate limit display
		const rl = this.plugin.api.rateLimit;
		if (rl.remaining < rl.limit) {
			containerEl.createEl("h2", { text: "API 狀態" });
			const resetTime = new Date(
				rl.resetTimestamp,
			).toLocaleTimeString();
			containerEl.createEl("p", {
				text: `API 配額：${rl.remaining}/${rl.limit}（重置時間：${resetTime}）`,
				cls: "setting-item-description",
			});
		}
	}
}
