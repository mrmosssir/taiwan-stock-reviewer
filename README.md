# StockReview - 台股盤後選股、概念題材與大盤分析儀表板

StockReview 是一個現代化的台股分析 Web 應用程式，搭配 **Cloud Stock Chooser (Cloudflare Workers + D1 + R2)** 後端，整合多資料夾自選股、每日波段選股、全市場外投成本比排行、官方產業與概念題材分類、大盤多空量化儀表板，以及專業 K 線與財報分析。

---

## 🚀 功能特色

### 1. 首頁觀察名單與盤後排行 (`Home`)
*   **多資料夾自選股管理**：支援新增、重新命名、刪除資料夾，儲存於瀏覽器 `localStorage`。
*   **每日推薦（波段啟動名單）**：串接後端選股引擎，快速檢視當日符合多方波段訊號的個股。
*   **外投成本排行 (Top 10)**：檢視全市場 1 / 6 / 12 日「外資＋投信」累積投入成本佔總市值比前 10 名，並顯示推估外投均價與現價乖離率。
*   **極速收盤報價**：個股列表直接讀取後端 D1 最新收盤價與漲跌幅，秒開不卡頓。

### 2. 分類選股：官方產業 ＋ 概念題材 (`Industries` / `IndustryStocks`)
*   **官方產業分類**：顯示各產業總股數、**波段啟動股數**與平均漲跌幅，並以 **太陽（強勢資金湧入）／雪花（弱勢資金流出）** 標示族群動能，支援依啟動股數、資金強弱、平均漲跌排序。
*   **概念題材與產業鏈**：整合 `Sinotrade/shioaji-data` 37 個主流族群（25 個熱門概念如 CoWoS、AI 伺服器、CPO、液冷散熱、機器人等 ＋ 12 條產業鏈），支援篩選全部 / 熱門概念 / 產業鏈與關鍵字搜尋，同樣依**啟動股數**排序。
*   **分類成分股清單**：啟動股自動置頂並以火焰圖示標註，支援本地無限捲動分批渲染；概念題材模式另顯示 **上／中／下游**、**主力** 徽章與詳細產業關聯說明。

### 3. 大盤多空總覽 (`MarketOverview`)
*   **加權指數 K 線與多空量化評分 (0~100)**：結合技術面、期貨未平倉與現貨法人/融資籌碼，支援歷史游標往前回溯載入。
*   **籌碼與信用指標**：完整追蹤三大法人現貨買賣超、外資／投信／自營商台指期淨未平倉、融資融券變化。
*   **全市場族群資金流向**：呈現各產業成交額佔比、較前 1 日 / 近 5 日佔比增減，以及外資＋投信資金淨流入/流出排行。
*   **開休市守門員 (`tradingHours.ts`)**：僅於開盤日盤中自動輪詢大盤指數即時報價，盤後與休市日自動停止輪詢。

### 4. 個股詳情頁 (`StockDetail`)
*   **專業 K 線圖**：採用 **TradingView Lightweight Charts v5**，支援日／週／月線切換、還原 K 線、均線 (SMA)、布林通道、MACD、KD、多策略自動進出場訊號標註與深淺色主題同步。
*   **概念題材標籤與產業定位卡片**：
    *   K 線上方顯示精簡概念標籤（手機版單行水平滑動不擠壓圖表），點擊可直接跳轉查看同概念股清單。
    *   K 線下方呈現「**概念題材與產業定位**」卡片，列出該股於各概念中的上/中/下游定位、主力角色與營收/業務關聯說明（超過 3 項自動收合）。
*   **籌碼與基本面**：整合三大法人買賣超、近一個月融資融券趨勢圖與明細表，以及季度財報（獲利能力、營收表現、財務結構、現金流量）。
*   **自選股快速收藏**：標題列星號下拉選單可直接將個股加入或移出任意自選資料夾。

---

## 🛠️ 技術棧

*   **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)（Class-based Dark Mode 與完整手機 RWD 響應式設計）
*   **Charts**: [Lightweight Charts v5](https://tradingview.github.io/lightweight-charts/) (TradingView)
*   **Icons**: [Lucide React](https://lucide.dev/)
*   **Routing**: React Router v7
*   **Data Sources**:
    *   **Cloud Stock Chooser API**（Cloudflare Workers + D1 + R2：K 線、選股訊號、最新收盤、外投排行、產業與概念分類、大盤與族群資金流向）
    *   [FinMind API](https://finmind.github.io/)（個股融資融券、除權息與季度財報）

---

## 📦 安裝與執行

```bash
# 1. 安裝套件
npm install

# 2. 啟動本地開發伺服器
npm run dev

# 3. 型別檢查與正式建置
npm run build
```

---

## 📂 專案結構

```text
src/
├── api.ts                       # 後端與 FinMind API 串接與資料型別定義
├── index.css                    # Tailwind v4 與深色模式配置
├── context/
│   └── WatchlistContext.tsx     # 多資料夾自選股狀態管理 (localStorage)
├── utils/
│   ├── signals.ts               # 多策略進出場訊號運算引擎
│   ├── resample.ts              # 日／週／月 K 線與法人籌碼重採樣
│   └── tradingHours.ts          # 台股開休市時段與假日守門員
├── components/
│   ├── AddStock.tsx             # 搜尋並加入自選股元件
│   ├── KLineChart.tsx           # TradingView K 線圖元件
│   ├── MarginChart.tsx          # 融資融券走勢圖元件
│   ├── StockRow.tsx             # 首頁個股收盤價與外投排行單列元件
│   └── ThemeToggle.tsx          # 深色／淺色主題切換鈕
├── pages/
│   ├── Home.tsx                 # 首頁（每日推薦、外投排行、自選資料夾）
│   ├── Industries.tsx           # 分類選股主頁（官方產業 / 概念題材）
│   ├── IndustryStocks.tsx       # 單一產業／概念題材成分股收盤清單
│   ├── MarketOverview.tsx       # 大盤多空總覽與族群資金流向
│   └── StockDetail.tsx          # 個股詳情頁（K 線、概念定位、籌碼、財報）
└── App.tsx                      # 路由設定
```
