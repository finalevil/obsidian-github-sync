[English](README.md) | 繁體中文

# GitHub Sync

透過 GitHub REST API 同步 Obsidian Vault，無需安裝 Git。

## 功能特色

- 雙向同步（本地 ↔ GitHub）
- 純 REST API，不依賴 Git
- 自動同步（開啟時 / 變更時 / 定時）
- 手動同步（命令面板或 Ribbon 按鈕）
- 衝突偵測與解決（自動建立 conflict 副本）
- 檔案忽略規則（glob 模式）
- 自訂 Commit 訊息範本
- 速率限制自動處理
- 支援桌面端與行動端

## 安裝方式

### 透過 BRAT 安裝（推薦測試版）

1. **安裝 BRAT 插件**
   - 開啟 Obsidian → 設定 → 第三方外掛 → 關閉安全模式（如尚未關閉）
   - 點擊「瀏覽」社群外掛
   - 搜尋「BRAT」
   - 找到「Obsidian42 - BRAT」後點擊「安裝」
   - 安裝完成後點擊「啟用」

2. **透過 BRAT 新增本插件**
   - 開啟 Obsidian → 設定 → Obsidian42 - BRAT（在左側選單的第三方外掛區域）
   - 點擊「Add Beta plugin」按鈕
   - 在彈出的輸入框中填入：`alex/obsidian-github-sync`
   - 點擊「Add Plugin」
   - 等待 BRAT 下載並安裝完成

3. **啟用插件**
   - 開啟 Obsidian → 設定 → 第三方外掛
   - 在已安裝的外掛清單中找到「GitHub Sync」
   - 將開關切換為啟用

BRAT 會自動追蹤 beta 版本更新，當有新版本發布時會自動通知並更新。

### 手動安裝

1. **下載檔案**
   - 前往本專案的 [GitHub Releases](https://github.com/alex/obsidian-github-sync/releases) 頁面
   - 在最新版本中下載以下三個檔案：`main.js`、`manifest.json`、`styles.css`

2. **放入插件目錄**
   - 找到你的 Vault 資料夾（就是 Obsidian 開啟的那個資料夾）
   - 進入 `.obsidian/plugins/` 目錄（如果 `plugins` 資料夾不存在就手動建立）
   - 在 `plugins` 目錄下建立一個新資料夾，命名為 `obsidian-github-sync`
   - 將下載的三個檔案放入這個資料夾中

3. **啟用插件**
   - 重新啟動 Obsidian
   - 開啟 設定 → 第三方外掛 → 關閉安全模式（如尚未關閉）
   - 在已安裝的外掛清單中找到「GitHub Sync」
   - 將開關切換為啟用

## 設定說明

### GitHub 連線設定

| 設定項目 | 說明 |
|---------|------|
| GitHub Token | Personal Access Token（需要 `repo` scope） |
| GitHub Repo | 格式：`owner/repo-name` |
| Branch | 要同步的分支（預設 `main`） |

設定完成後可點擊「測試連線」按鈕驗證設定是否正確。

### 自動同步設定

| 設定項目 | 預設值 | 說明 |
|---------|--------|------|
| 啟用自動同步 | 開啟 | 自動偵測變更並同步 |
| 開啟時同步 | 開啟 | Obsidian 啟動時自動從 GitHub 同步 |
| 變更時同步 | 開啟 | 檔案變更後自動同步到 GitHub |
| Debounce 秒數 | 30 | 檔案變更後等待多少秒再同步 |
| 定時同步 | 開啟 | 每隔固定時間自動同步 |
| 同步間隔（分鐘） | 5 | 定時同步的間隔 |

### 進階設定

| 設定項目 | 說明 |
|---------|------|
| Commit 訊息範本 | 支援 `{{date}}` 作為日期佔位符（預設 `vault sync: {{date}}`） |
| 忽略規則 | 每行一個 glob 規則，符合的檔案不會同步 |
| 除錯日誌 | 在開發者工具中顯示詳細日誌 |

## 使用方式

- **命令面板**（`Ctrl/Cmd + P`）：
  - `GitHub Sync: 立即同步` — 執行一次增量同步
  - `GitHub Sync: 強制完整同步` — 忽略快取，重新比對所有檔案
- **Ribbon 按鈕**：點擊左側工具列的同步圖示
- **狀態欄**：底部狀態欄會顯示目前的同步狀態

## 開發

```bash
npm install
npm run dev      # 開發模式
npm run build    # 生產構建
```

## 授權

MIT License
