# GEMINI.md - AI Agent Context & Handoff

This document serves as a context memory for AI agents (Gemini, ChatGPT, Claude) to quickly understand the project's architectural decisions, API quirks, and development guidelines. **Read this first before starting any task.**

## 🧠 Project Context & Memories

### 1. API Integration Strategy (Critical)
*   **CORS Handling**: Do NOT fetch directly from `api.fugle.tw` or `api.finmindtrade.com` in the browser.
    *   Use the **Vite Proxy** configured in `vite.config.ts`.
    *   **Fugle**: Request `/v1.0/...` → Proxies to `https://api.fugle.tw/marketdata/v1.0/...`
    *   **FinMind**: Request `/finmind` → Proxies to `https://api.finmindtrade.com/api/v4/data`
*   **Fugle API (v1.0)**:
    *   Used for: Real-time Quote, Intraday Ticker, Historical Candles.
    *   **Limit**: Candle fetches are strictly limited to **180 days** per request to avoid errors.
    *   **Pagination**: `fetchHistoricalCandles` supports `endDate` for infinite scrolling (implemented in `StockDetail.tsx`).
*   **FinMind API**:
    *   Used for: Institutional Investors, Margin Trading, Financial Statements (EPS, Revenue, ROE).
    *   **Quirks**: Field names are inconsistent (mix of English, CamelCase, and Chinese).
    *   **Solution**: `src/api.ts` implements a robust **Field Mapping Strategy**. Always check this file before adding new data points.
    *   **Source Separation**: Financial data is merged from `FinancialStatements`, `BalanceSheet`, and `CashFlowsStatement` to ensure data completeness (e.g., Debt Ratio needs BS, ROE needs FS + BS).

### 2. Charting Library (Lightweight Charts v5)
*   **Version**: v5.x (Breaking changes from v3/v4).
*   **Syntax**: Use `chart.addSeries(CandlestickSeries, options)` instead of `addCandlestickSeries()`.
*   **Strict Mode Safety**: `src/components/KLineChart.tsx` implements strict cleanup logic (`try-catch` on remove) to prevent "Object is disposed" errors in React Strict Mode.
*   **Infinite Scroll**: Implemented via `subscribeVisibleLogicalRangeChange`.
*   **Theme Synchronization**:
    *   The chart uses `chart.applyOptions` to switch colors.
    *   It relies on the parent component passing an `isDarkMode` prop.
    *   Parent components listen for a custom `theme-change` event to ensure sync with Tailwind's DOM changes.

### 3. Styling (Tailwind CSS v4)
*   **Setup**: Uses the new `@import "tailwindcss";` syntax in `index.css`.
*   **Dark Mode**:
    *   Configured manually via CSS variant: `@variant dark (&:where(.dark, .dark *));`.
    *   **No** `tailwind.config.js` is used for theming.
    *   Toggled by adding/removing the `.dark` class on the `<html>` element.

## 📂 Key File Responsibilities

| File | Responsibility | AI Attention Point |
| :--- | :--- | :--- |
| `src/api.ts` | **The Brain.** Handles all external data fetching, normalizing, and type definitions. | **Always** check here for field mappings (especially FinMind Chinese keys) before debugging "missing data". |
| `src/pages/StockDetail.tsx` | **The Coordinator.** Orchestrates data loading (Promise.all), manages state for tabs, and handles infinite scroll triggers. | Uses `window.addEventListener('theme-change', ...)` to sync chart theme with UI theme. |
| `src/components/KLineChart.tsx` | **The Visualizer.** Wraps Lightweight Charts. | Handles the complex logic of dynamic series updates (MA/BB/MACD) and data merging. Now supports Trading Signals via `createSeriesMarkers` plugin. |
| `src/components/ThemeToggle.tsx` | **Theme Manager.** | Toggles `dark` class on `html` AND dispatches `theme-change` event for non-React/Canvas components. |
| `src/utils/signals.ts` | **The Analyst.** Signal generation logic. | Implements a state-machine based trend analysis (Start, Add, Exit, Short) using Technical and Chip data. |
| `vite.config.ts` | **The Gateway.** Configures the Proxy Server. | Modify this if you add a new external API domain. |

## 📈 Trading Signal System (Master Logic)

The system uses a **State Machine** to track trends and prevent conflicting signals. Defined in `src/utils/signals.ts`.

### 1. Long Start (做多啟動)
*   **Reversal (起漲)**: Cross MA20 + Explosive Volume (>1.25x) + Solid Candle + Low Bias.
*   **Breakout (破前高)**: Close > 20-day High + Volume > Avg + Solid Candle.
*   **Bollinger Open (布林開口)**: Band Width expansion + Close > Upper Band.
*   **Institutional Support**: 3-day Continuous Investment Trust Buy (投信連買).

### 2. Exit Strategy (平多/平空)
*   **Grace Period**: 6-day protection after start.
*   **Standard Exit**: Close < MA20 AND Institutional Net Sell.
*   **High Profit Protection (>40% gain)**:
    *   Exits immediately on MA10 break.
    *   **RSI Divergence**: RSI < 70 while Price near highs.
*   **Safety Net**:
    *   **Sudden Death (長黑閃崩)**: >6% drop + Solid Black Candle.
    *   **Chandelier Stop**: Exit if price drops 3x ATR from highest high.
    *   **Structure Break**: Close < Lowest Low of past 20 days.

### 3. Add Positions (加碼)
*   **Long Add**: Multi-MA Bullish Array (5>10>20) + Price touches MA20 + No heavy selling + Safe Bias (<5%).

## 📝 Development Guidelines for AI

1.  **Import Type**: When importing interfaces in Vite/ESM, **ALWAYS** use `import type { ... }`.
    *   *Bad*: `import { StockTicker } from '../api'`
    *   *Good*: `import type { StockTicker } from '../api'`
    *   *Reason*: Prevents "does not provide an export" runtime errors.

2.  **FinMind Field Mapping**:
    *   Never assume a field name (e.g., `NetIncome`) exists.
    *   Always check `src/api.ts` and look for the fallback chain (e.g., `d['NetIncome'] || d['本期淨利']`).
    *   If adding a new metric, run a debug log to see `uniqueTypes` first.

3.  **React Strict Mode**:
    *   All `useEffect` hooks involving Charts or Listeners must have robust **cleanup functions**.
    *   Avoid firing API calls twice if possible (use `useRef` flags if necessary).

4.  **Theme Synchronization (Tailwind v4 + Canvas)**:
    *   When changing the theme logic, ensure **BOTH** the DOM class (`.dark`) and the custom event (`theme-change`) are handled.
    *   Tailwind v4 requires explicit `@variant dark` in CSS to work with class-based toggling.

## 🚀 How to Start a New Feature

1.  **Check `src/api.ts`**: Do we already have the data? If not, can FinMind/Fugle provide it?
2.  **Update Interface**: Add types to `api.ts`.
3.  **Implement Fetch**: Add the function in `api.ts` (remember Proxy!).
4.  **Update Component**: Add state in `StockDetail.tsx` and pass data to a new or existing UI component.

---
*Last Updated: 2026-02-09*