import { App, Modal } from "obsidian";

export class ConflictModal extends Modal {
	private conflicts: string[];

	constructor(app: App, conflicts: string[]) {
		super(app);
		this.conflicts = conflicts;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "同步衝突" });
		contentEl.createEl("p", {
			text: `偵測到 ${this.conflicts.length} 個檔案衝突。遠端版本已儲存為副本，本地版本保持不變。`,
		});

		const list = contentEl.createEl("ul");
		for (const conflict of this.conflicts) {
			list.createEl("li", { text: conflict });
		}

		contentEl.createEl("p", {
			text: "請手動比對副本檔案，保留需要的版本後刪除副本。",
			cls: "setting-item-description",
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
