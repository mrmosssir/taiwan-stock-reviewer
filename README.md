# StockReview - 台股即時行情與分析儀表板

StockReview 是一個現代化的台股分析 Web 應用程式，旨在提供投資人一個乾淨、快速且功能強大的看盤介面。整合了即時報價、專業 K 線圖、技術指標分析、籌碼面追蹤以及基本面財報數據。

![StockReview Screenshot](https://images.unsplash.com/photo-1611974765270-cab0330035fa?auto=format&fit=crop&q=80&w=1000)

## 🚀 功能特色

*   **即時行情追蹤**：
    *   自選股清單管理（Local Storage 儲存）。
    *   即時股價、漲跌幅、成交量監控。
    *   串接 **Fugle 富果行情 API**。

*   **專業技術分析 (K 線圖)**：
    *   整合 **TradingView Lightweight Charts**。
    *   支援日線、週線、月線切換。
    *   **無限捲動 (Infinite Scroll)**：自動載入歷史資料，流暢回溯。
    *   **技術指標**：可開關的均線 (SMA)、布林通道 (Bollinger Bands)、MACD、KD。
    *   成交量副圖。

*   **籌碼面分析 (Institutional & Margin)**：
    *   **三大法人買賣超**：每日外資、投信、自營商動向。
    *   **融資融券餘額**：視覺化呈現資券變化與券資比。
    *   串接 **FinMind API**。

*   **基本面財報 (Financials)**：
    *   **獲利能力**：EPS、本期淨利、毛利率、營業利益率。
    *   **財務結構**：負債比率、權益總額。
    *   **經營效率**：股東權益報酬率 (ROE)。
    *   **現金流量**：營業現金流 (OCF) 監控。

## 🛠️ 技術棧

*   **Frontend Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
*   **Build Tool**: [Vite](https://vitejs.dev/)
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) (使用 `@import "tailwindcss";` 新語法)
*   **Charts**: [Lightweight Charts v5](https://tradingview.github.io/lightweight-charts/) (TradingView)
*   **Icons**: [Lucide React](https://lucide.dev/)
*   **Routing**: React Router v7
*   **Data Sources**:
    *   [Fugle Market Data API](https://developer.fugle.tw/) (行情)
    *   [FinMind API](https://finmind.github.io/) (籌碼/財報)

## 📦 安裝與執行

1.  **複製專案**
    ```bash
    git clone https://github.com/yourusername/stock-review.git
    cd stock-review
    ```

2.  **安裝套件**
    ```bash
    npm install
    ```

3.  **啟動開發伺服器**
    ```bash
    npm run dev
    ```
    瀏覽器打開 `http://localhost:5173` 即可使用。

## 🔑 環境設定與 API Key

*   **Fugle API Key**:
    *   進入應用程式後，在首頁上方輸入您的 Fugle API Key (可至 [Fugle Developer](https://developer.fugle.tw/) 申請)。
    *   Key 會儲存在瀏覽器的 `localStorage`，不會上傳至任何伺服器。

*   **Proxy 設定 (重要)**:
    *   專案使用 `vite.config.ts` 設定了 Proxy 來解決 CORS 問題。
    *   `/v1.0` -> `https://api.fugle.tw/marketdata`
    *   `/finmind` -> `https://api.finmindtrade.com/api/v4/data`

## 📂 專案結構

```
src/
├── api.ts              # 核心資料層 (Fugle & FinMind 整合)
├── components/         # UI 元件
│   ├── KLineChart.tsx  # K 線圖 (包含指標計算與無限載入邏輯)
│   ├── MarginChart.tsx # 融資融券走勢圖
│   └── StockRow.tsx    # 列表單列元件
├── pages/              # 頁面元件
│   ├── Home.tsx        # 首頁 (自選股列表)
│   └── StockDetail.tsx # 個股詳情頁 (整合所有圖表與數據)
└── App.tsx             # 路由設定
```

## 🤝 貢獻

歡迎提交 Pull Request 或 Issue。開發時請遵循現有的 TypeScript 類型定義與 Tailwind CSS 設計規範。