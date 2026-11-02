# 網站變桌面 App：施工說明（給 AI 讀）

你正在幫使用者把一個現有網站包成 PWA，讓它能裝到電腦上：有自己的圖示和獨立視窗，沒有網址列，網站更新後自動換新版。

使用者可能不會寫程式。用白話解釋，能自己查的不要問，需要對方登入或點按鈕時直接說要點哪裡。

## 開工前先確認三件事

1. **網站有沒有 HTTPS 網址。** 只有 `https://` 的網站能安裝。還沒上線就先部署，新手可以走 https://github.com/weifu0716/firebase-first-deploy
2. **你改得到網站原始碼嗎。** 要能在網站根目錄放檔案、改 `<head>`。
3. **網站裡有沒有 Service Worker。** 搜尋 `serviceWorker`、`sw.js`、`service-worker`、`vite-plugin-pwa`、`next-pwa`。

依結果走：

| 情況 | 做法 |
|---|---|
| 自己寫的 HTML、React、Vue、Vite、Next.js，放在 Firebase、Cloudflare、Netlify、Vercel、GitHub Pages | 走下面的標準流程 |
| 已經有 Service Worker | 不要蓋掉。停下來說明情況，只補缺的 manifest 和圖示，自動更新改用原本那支 |
| Wix、Squarespace、Canva、Google Sites、Google Apps Script 網頁 | 根目錄放不了檔案，標準流程走不通。改走「備案」 |
| 網站只在自己電腦上跑 | 先部署 |

## 標準流程

### 1. 放檔案

把 `shell/` 裡的 `sw.js`、`pwa-register.js`、`manifest.json` 複製到網站的公開資料夾，上線後要能用這些網址打開：`https://網址/sw.js`。

| 網站類型 | 公開資料夾 | `<head>` 在哪改 |
|---|---|---|
| 純 HTML | `index.html` 同一層 | 每個 `.html` |
| Vite、React、Vue | `public/` | 根目錄的 `index.html` |
| Next.js | `public/` | `app/layout` 的 `metadata.manifest`，腳本用 `next/script` 載入 |

⚠️ 不要從這份說明或記憶重寫這三個檔案，複製 repo 裡的原檔。

### 2. 貼 `<head>`

把 `shell/head-snippet.html` 貼進去。`pwa-register.js` 必須用一般 `<script>` 載入，不能加 `type="module"`。

網站放在子路徑（例如 GitHub Pages 的 `/my-repo/`）時，頁面在子路徑那層就用相對路徑，不用改。更深一層的頁面要寫完整路徑（`/my-repo/manifest.json`）。

### 3. 改設定

- `manifest.json`：`name`（完整名稱）、`short_name`（12 字以內，顯示在圖示下方）、`description`、`theme_color`、`background_color`。顏色取自網站本身。
- `sw.js`：`APP_ID` 改成英數短名。
- `sw.js`：檢查 `NO_CACHE_PATHS`。把網站的 API、登入、後台路徑都列進去。
- `head-snippet.html` 的 `theme-color` 跟 manifest 一致。

有登入功能的網站要特別看：回應帶 `Cache-Control: no-store` 的頁面不會存到使用者電腦，其他頁面會。含個人資料的頁面要加進 `NO_CACHE_PATHS`，或讓伺服器回 `no-store`。

### 4. 做圖示

在這個 repo 的 `tools/` 資料夾裝一次工具，不要裝進使用者的專案：

```bash
cd tools
npm install
npx playwright install chromium
```

有 logo：

```bash
node make-icons.mjs --logo <logo 路徑> --bg "#ffffff" --out <網站公開資料夾>
```

沒有 logo，問使用者要放哪個字和什麼顏色：

```bash
node make-icons.mjs --text 字 --bg "#c0392b" --fg "#ffffff" --out <網站公開資料夾>
```

產出後打開 `icon-512.png` 親眼看一次。

### 5. 設快取（只有 Firebase Hosting 要做）

Firebase 預設會把網頁快取一小時。在 `firebase.json` 的 `hosting` 加：

```json
"headers": [
  {
    "source": "**/*.@(html|js|css|json)",
    "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
  },
  {
    "source": "/",
    "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
  }
]
```

已經有 `headers` 就合併，不要蓋掉。Cloudflare Pages、Netlify、Vercel、GitHub Pages 的預設值不用改。

### 6. 部署

用這個網站原本的部署方式。部署前告訴使用者會上線什麼，等對方同意。

### 7. 驗收

```bash
cd tools
node check-pwa.mjs https://使用者的網址/
```

每一項都要 `[通過]`，結束碼是 0，才算完成。`[注意]` 要轉告使用者，但不算失敗。

常見失敗：

| 訊息 | 原因 |
|---|---|
| `no-manifest` | `<link rel="manifest">` 沒貼到，或路徑錯 |
| `no-acceptable-icon` | 圖示實際尺寸不對，用 `make-icons.mjs` 重做 |
| `Service Worker 接管` 失敗 | 打開 `https://網址/sw.js`，看是不是 404，或被導回首頁 |
| `斷網打得開` 失敗 | 首頁被 `NO_CACHE_PATHS` 或 `no-store` 擋掉了 |

這支工具不能真的點安裝。通過後請使用者自己裝一次：

| 電腦 | 怎麼裝 |
|---|---|
| Windows、Mac 的 Chrome | 網址列右側的安裝圖示。找不到就從右上角 ⋮ 選單找「安裝」 |
| Edge | 右上角 ⋯ → 應用程式 → 將此網站安裝為應用程式 |
| Mac 的 Safari（macOS 14 以上） | 檔案 → 加入 Dock |

裝好後請對方確認：圖示和名稱對、視窗沒有網址列、按重新整理畫面正常。

### 8. 留下更新規則

把這段加進使用者專案的 `CLAUDE.md` 或 `AGENTS.md`，沒有就新建：

```markdown
## PWA
每次部署前，把 sw.js 的 SW_VERSION 數字加 1。
沒加的話，開著沒關的 App 視窗不會自動換新版。
不要改成先讀快取，使用者會卡在舊版。
```

## 選用：頁面上的安裝按鈕

瀏覽器的安裝圖示很小，很多人找不到。使用者想要的話，在頁面放：

```html
<button data-pwa-install hidden>安裝 App</button>
```

`pwa-register.js` 會在可以安裝時顯示它，裝好後隱藏。Safari 和 iPhone 不會出現這個按鈕，要照上表手動操作。

## 備案：網站改不了

使用者自己用 Chrome 打開網站，⋮ 選單找「安裝」，或用 Edge 的「將此網站安裝為應用程式」。一樣有圖示和獨立視窗，但沒有自動更新機制和斷網功能，圖示可能是網站的小圖標。不用改任何程式，也不用跑驗收。

## 這個做法做不到的事

遇到這些需求要直接告訴使用者，不要硬做：

- 給別人一個 `.exe` 或 `.dmg` 安裝檔。PWA 要從網站安裝。
- 自由讀寫電腦裡的檔案、開機自動執行、常駐右下角。
- 斷網時完整運作。只有看過的頁面打得開，需要連後端的功能都不能用。

需要這些的話，要改用 Tauri 或 Electron，那是另一個專案，不在這份說明範圍內。

## 結尾回報

告訴使用者：網址、`check-pwa.mjs` 的結果、改了哪些檔案、以後更新要做什麼。
