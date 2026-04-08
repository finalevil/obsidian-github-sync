English | [繁體中文](README.zh-TW.md)

# GitHub Sync

Sync your Obsidian Vault via GitHub REST API — no Git installation required.

## Features

- Bidirectional sync (Local ↔ GitHub)
- Pure REST API, no Git dependency
- Auto sync (on open / on change / on interval)
- Manual sync (command palette or Ribbon button)
- Conflict detection and resolution (auto-creates conflict copies)
- File ignore rules (glob patterns)
- Custom commit message templates
- Automatic rate limit handling
- Desktop and mobile support

## Installation

### Via BRAT (Recommended for Beta)

1. **Install the BRAT plugin**
   - Open Obsidian → Settings → Community plugins → Disable Restricted Mode (if not already)
   - Click "Browse" community plugins
   - Search for "BRAT"
   - Find "Obsidian42 - BRAT" and click "Install"
   - Click "Enable" after installation

2. **Add this plugin via BRAT**
   - Open Obsidian → Settings → Obsidian42 - BRAT (in the Community plugins section)
   - Click the "Add Beta plugin" button
   - Enter: `alex/obsidian-github-sync`
   - Click "Add Plugin"
   - Wait for BRAT to download and install

3. **Enable the plugin**
   - Open Obsidian → Settings → Community plugins
   - Find "GitHub Sync" in the installed plugins list
   - Toggle it on

BRAT will automatically track beta updates and notify you when new versions are available.

### Manual Installation

1. **Download files**
   - Go to the [GitHub Releases](https://github.com/alex/obsidian-github-sync/releases) page
   - Download these three files from the latest release: `main.js`, `manifest.json`, `styles.css`

2. **Copy to plugins directory**
   - Locate your Vault folder (the folder Obsidian opens)
   - Navigate to `.obsidian/plugins/` (create the `plugins` folder if it doesn't exist)
   - Create a new folder named `obsidian-github-sync` inside `plugins`
   - Place the three downloaded files into this folder

3. **Enable the plugin**
   - Restart Obsidian
   - Open Settings → Community plugins → Disable Restricted Mode (if not already)
   - Find "GitHub Sync" in the installed plugins list
   - Toggle it on

## Configuration

### GitHub Connection

| Setting | Description |
|---------|-------------|
| GitHub Token | Personal Access Token (requires `repo` scope) |
| GitHub Repo | Format: `owner/repo-name` |
| Branch | Branch to sync (default: `main`) |

After configuration, click the "Test Connection" button to verify your settings.

### Auto Sync

| Setting | Default | Description |
|---------|---------|-------------|
| Enable Auto Sync | On | Automatically detect changes and sync |
| Sync on Open | On | Sync from GitHub when Obsidian starts |
| Sync on Change | On | Sync to GitHub after file changes |
| Debounce (seconds) | 30 | Wait time after file change before syncing |
| Interval Sync | On | Sync automatically at regular intervals |
| Sync Interval (minutes) | 5 | Interval between automatic syncs |

### Advanced

| Setting | Description |
|---------|-------------|
| Commit Message Template | Supports `{{date}}` placeholder (default: `vault sync: {{date}}`) |
| Ignore Rules | One glob pattern per line; matched files are excluded from sync |
| Debug Logging | Show detailed logs in developer tools |

## Usage

- **Command Palette** (`Ctrl/Cmd + P`):
  - `GitHub Sync: Sync Now` — Run an incremental sync
  - `GitHub Sync: Force Full Sync` — Ignore cache and re-compare all files
- **Ribbon Button**: Click the sync icon in the left sidebar
- **Status Bar**: The bottom status bar shows current sync status

## Development

```bash
npm install
npm run dev      # Development mode
npm run build    # Production build
```

## License

MIT License
