export class Logger {
	private enabled: boolean;
	private prefix = "[GitHub Sync]";

	constructor(enabled: boolean) {
		this.enabled = enabled;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	debug(...args: unknown[]): void {
		if (this.enabled) {
			console.debug(this.prefix, ...args);
		}
	}

	info(...args: unknown[]): void {
		console.info(this.prefix, ...args);
	}

	warn(...args: unknown[]): void {
		console.warn(this.prefix, ...args);
	}

	error(...args: unknown[]): void {
		console.error(this.prefix, ...args);
	}
}
