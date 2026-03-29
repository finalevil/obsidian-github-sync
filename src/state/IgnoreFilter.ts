export class IgnoreFilter {
	private patterns: string[];
	private static readonly DEFAULT_PATTERNS = [
		".obsidian/workspace.json",
		".obsidian/workspace-mobile.json",
		".DS_Store",
		".git",
		".git/**",
	];

	constructor(userPatterns: string[]) {
		this.patterns = [...IgnoreFilter.DEFAULT_PATTERNS, ...userPatterns];
	}

	updatePatterns(userPatterns: string[]): void {
		this.patterns = [...IgnoreFilter.DEFAULT_PATTERNS, ...userPatterns];
	}

	shouldIgnore(path: string): boolean {
		for (const pattern of this.patterns) {
			if (this.matchPattern(pattern, path)) {
				return true;
			}
		}
		return false;
	}

	private matchPattern(pattern: string, path: string): boolean {
		// Exact match
		if (pattern === path) return true;

		// Directory prefix match (pattern ends with /)
		if (pattern.endsWith("/")) {
			return (
				path.startsWith(pattern) || path === pattern.slice(0, -1)
			);
		}

		// Convert glob pattern to regex
		const regexStr = pattern
			.replace(/[.+^${}()|[\]\\]/g, "\\$&")
			.replace(/\*\*/g, "{{DOUBLESTAR}}")
			.replace(/\*/g, "[^/]*")
			.replace(/\?/g, "[^/]")
			.replace(/{{DOUBLESTAR}}/g, ".*");

		const regex = new RegExp(`^${regexStr}$`);
		return regex.test(path);
	}
}
