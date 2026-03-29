import type { SyncStatus } from "../sync/SyncManager";

export class StatusBar {
	private el: HTMLElement;
	private onClick: () => void;

	constructor(statusBarEl: HTMLElement, onClick: () => void) {
		this.el = statusBarEl;
		this.onClick = onClick;
		this.el.addClass("github-sync-status");
		this.el.onClickEvent(() => this.onClick());
		this.update("idle");
	}

	update(status: SyncStatus, lastSync?: number): void {
		let text: string;
		switch (status) {
			case "syncing":
				text = "\u21BB 同步中...";
				break;
			case "error":
				text = "\u2717 同步錯誤";
				break;
			case "up-to-date":
				text = lastSync
					? `\u2713 ${this.formatTime(lastSync)}`
					: "\u2713 已同步";
				break;
			default:
				text = "\u25CB GitHub Sync";
		}
		this.el.setText(text);
	}

	private formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	}
}
