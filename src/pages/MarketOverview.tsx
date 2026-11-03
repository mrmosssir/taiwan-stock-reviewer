import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldAlert,
  BarChart3,
  Layers,
  BookOpen,
  PieChart,
  X,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { KLineChart } from '../components/KLineChart';
import { MarketScoreChart } from '../components/MarketScoreChart';
import { MarketInstChart } from '../components/MarketInstChart';
import { MarketFuturesChart } from '../components/MarketFuturesChart';
import { MarketMarginBalanceChart } from '../components/MarketMarginBalanceChart';
import { fetchMarketHistory, fetchMarketLatest } from '../api';
import type { MarketDailyRecord, StockCandle } from '../api';
import { calculateMarketStrategySignals, type MarketStrategyMode } from '../utils/signals';

export const MarketOverview = () => {
  const navigate = useNavigate();
  const [historyData, setHistoryData] = useState<MarketDailyRecord[]>([]);
  const [latestData, setLatestData] = useState<MarketDailyRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'score' | 'inst' | 'futures' | 'margin'>('all');
  const [strategyMode, setStrategyMode] = useState<MarketStrategyMode>('advanced_3x');
  const [showLogicModal, setShowLogicModal] = useState(false);
  const [showAllocationModal, setShowAllocationModal] = useState(false);

  const oldestDateRef = useRef<string | null>(null);
  const hasMoreRef = useRef<boolean>(true);
  const isLoadingMoreRef = useRef<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 單次 API 預設抓取最近 2 年（約 480 個交易日）
      const [history, latest] = await Promise.all([
        fetchMarketHistory(480),
        fetchMarketLatest()
      ]);
      setHistoryData(history);
      oldestDateRef.current = history.length > 0 ? history[0].date : null;
      hasMoreRef.current = history.length >= 480;
      setLatestData(latest || (history.length > 0 ? history[history.length - 1] : null));
    } catch (e) {
      console.error('Failed to load market data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 當使用者在 K 線圖往左滑動超過已載入的 2 年邊界時，自動向 API 請求更早的 2 年資料
  const handleLoadMoreHistory = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRef.current || !oldestDateRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const olderRecords = await fetchMarketHistory(480, oldestDateRef.current);
      if (olderRecords.length === 0) {
        hasMoreRef.current = false;
        return;
      }
      if (olderRecords.length < 480) {
        hasMoreRef.current = false;
      }
      setHistoryData((prev) => {
        const existingDates = new Set(prev.map((d) => d.date));
        const uniqueOlder = olderRecords.filter((d) => !existingDates.has(d.date));
        if (uniqueOlder.length === 0) {
          hasMoreRef.current = false;
          return prev;
        }
        const merged = [...uniqueOlder, ...prev].sort((a, b) => a.date.localeCompare(b.date));
        oldestDateRef.current = merged[0].date;
        return merged;
      });
    } catch (e) {
      console.error('Failed to load older market history:', e);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  // 計算大盤五段式策略訊號與當前建議檔位
  const strategyResult = useMemo(() => {
    return calculateMarketStrategySignals(historyData, strategyMode);
  }, [historyData, strategyMode]);

  // 過濾出目前顯示區間內的 K 線標記
  const visibleMarkers = useMemo(() => {
    if (strategyMode === 'off' || historyData.length === 0) return [];
    const startDate = historyData[0].date;
    return strategyResult.markers.filter((m) => String(m.time) >= startDate);
  }, [strategyResult.markers, historyData, strategyMode]);

  // 將大盤資料轉換為 KLineChart 所需的 StockCandle 格式
  const candles: StockCandle[] = useMemo(
    () =>
      historyData.map((d) => ({
        date: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      })),
    [historyData]
  );

  const current = latestData || (historyData.length > 0 ? historyData[historyData.length - 1] : null);
  const pos = strategyResult.currentPosition;

  const getStatusColor = (status?: string) => {
    if (status === 'bull') return 'bg-red-500 text-white';
    if (status === 'bear') return 'bg-emerald-600 text-white';
    return 'bg-amber-500 text-white';
  };

  const getStatusBorder = (status?: string) => {
    if (status === 'bull') return 'border-red-500/40 dark:border-red-500/30';
    if (status === 'bear') return 'border-emerald-500/40 dark:border-emerald-500/30';
    return 'border-amber-500/40 dark:border-amber-500/30';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200 pb-16">
      {/* 導覽列 */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 dark:hover:text-white transition-colors"
              title="返回自選清單"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <BarChart3 size={24} strokeWidth={2.5} />
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                台股大盤走勢與多空籌碼總覽
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              重新整理
            </button>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 頂部大盤體質與多空狀態卡 */}
        {current && (
          <div className={`bg-white dark:bg-gray-800 rounded-2xl p-6 border-2 shadow-sm ${getStatusBorder(current.status)}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-700">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                    發行量加權股價指數 (TAIEX)
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase shadow-xs ${getStatusColor(current.status)}`}>
                    {current.statusText}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-gray-900 dark:text-white">
                    {(current.close ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span
                    className={`flex items-center text-base font-bold ${
                      (current.change || 0) >= 0 ? 'text-red-500' : 'text-emerald-500'
                    }`}
                  >
                    {(current.change || 0) >= 0 ? <TrendingUp size={18} className="mr-0.5" /> : <TrendingDown size={18} className="mr-0.5" />}
                    {(current.change || 0) > 0 ? '+' : ''}
                    {(current.change || 0).toFixed(2)} (
                    {current.close > 0 && current.change
                      ? `${((current.change / (current.close - current.change)) * 100).toFixed(2)}%`
                      : '0.00%'}
                    )
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    成交金額：{((current.tradeValue ?? 0) / 1e8).toFixed(0)} 億元
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto md:ml-0">
                    統計日期：{current.date}
                  </span>
                </div>
              </div>

              {/* 多空綜合量化評分卡 */}
              <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-900/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="text-right">
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">多空綜合指標評分</div>
                  <div className="text-2xl font-black text-gray-900 dark:text-gray-100">
                    {current.score} <span className="text-xs font-normal text-gray-500">/ 100</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-md bg-linear-to-tr from-gray-700 to-gray-900 dark:from-gray-600 dark:to-gray-800">
                  <Activity size={22} className={current.score >= 65 ? 'text-red-400' : current.score <= 35 ? 'text-emerald-400' : 'text-amber-400'} />
                </div>
              </div>
            </div>

            {/* 關鍵訊號摘要卡 */}
            {current.summary && (
              <div className="mt-4 flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300 bg-blue-50/60 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900/40">
                <ShieldAlert size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-blue-900 dark:text-blue-300">盤後多因子訊號診斷：</span>
                  {current.summary}
                </div>
              </div>
            )}

            {/* 四大核心指標 KPI 網格 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {/* 1. 三大法人買賣超 */}
              <div className="bg-gray-50 dark:bg-gray-700/40 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">三大法人現貨合計</div>
                <div className={`text-lg font-bold mt-1 ${(current.totalInstNet ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {(current.totalInstNet ?? 0) >= 0 ? '+' : ''}{((current.totalInstNet ?? 0) / 1e8).toFixed(1)} 億
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  外資 {((current.foreignNet ?? 0) / 1e8).toFixed(1)} | 投信 {((current.trustNet ?? 0) / 1e8).toFixed(1)}
                </div>
              </div>

              {/* 2. 外資期貨未平倉 */}
              <div className="bg-gray-50 dark:bg-gray-700/40 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">外資台指期未平倉</div>
                <div className={`text-lg font-bold mt-1 ${(current.foreignFuturesOI ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {(current.foreignFuturesOI ?? 0) > 0 ? '+' : ''}{(current.foreignFuturesOI ?? 0).toLocaleString()} 口
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {(current.foreignFuturesOI ?? 0) <= -30000 ? '⚠️ 重兵避險空單' : (current.foreignFuturesOI ?? 0) >= 0 ? '🔥 淨多單偏多' : '常態避險調節'}
                </div>
              </div>

              {/* 3. 散戶融資餘額 */}
              <div className="bg-gray-50 dark:bg-gray-700/40 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">大盤融資餘額</div>
                <div className="text-lg font-bold mt-1 text-gray-900 dark:text-gray-100">
                  {((current.marginBalance ?? 0) / 1e5).toFixed(1)} 億
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  今日增減：
                  <span className={(current.marginDiff ?? 0) >= 0 ? 'text-red-500 font-semibold' : 'text-emerald-500 font-semibold'}>
                    {(current.marginDiff ?? 0) >= 0 ? '+' : ''}{((current.marginDiff ?? 0) / 1e5).toFixed(2)} 億
                  </span>
                </div>
              </div>

              {/* 4. 融券餘額 */}
              <div className="bg-gray-50 dark:bg-gray-700/40 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">融券餘額 (張)</div>
                <div className="text-lg font-bold mt-1 text-gray-900 dark:text-gray-100">
                  {(current.shortBalance ?? 0).toLocaleString()} 張
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  今日增減：
                  <span className={(current.shortDiff ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                    {(current.shortDiff ?? 0) >= 0 ? '+' : ''}{(current.shortDiff ?? 0).toLocaleString()} 張
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 時間區間與圖表篩選工具列 */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          {/* 圖表模式 Tab */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Layers size={14} /> 全部綜合圖表
            </button>
            <button
              onClick={() => setActiveTab('score')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'score'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              🎯 自訂多空指標
            </button>
            <button
              onClick={() => setActiveTab('inst')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'inst'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              🏢 法人現貨
            </button>
            <button
              onClick={() => setActiveTab('futures')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'futures'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              ⚡ 期貨未平倉
            </button>
            <button
              onClick={() => setActiveTab('margin')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'margin'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              👥 融資融券
            </button>
          </div>

          {/* K 線視野與動態歷史載入狀態 */}
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {isLoadingMore && (
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                <RefreshCw size={12} className="animate-spin" />
                正在載入更早 2 年歷史...
              </span>
            )}
            {historyData.length > 0 && (
              <span>
                預設顯示近半年 K 線 · 往左滑動可看更早歷史（已載入{' '}
                <strong className="text-gray-700 dark:text-gray-300">{historyData[0].date}</strong> ~{' '}
                <strong className="text-gray-700 dark:text-gray-300">{historyData[historyData.length - 1].date}</strong>，共{' '}
                {historyData.length} 日）
              </span>
            )}
          </div>
        </div>

        {/* 圖表展示區塊 */}
        {isLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center text-gray-400 border border-gray-200 dark:border-gray-700 shadow-sm">
            <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-blue-500" />
            正在載入大盤走勢與指標資料...
          </div>
        ) : historyData.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center text-gray-500 border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
            <BarChart3 size={40} className="mx-auto text-gray-400" />
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">尚無大盤歷史資料</h3>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              請先於後端執行歷史回補腳本 (例如：<code>npm run backfill-market</code>) 或呼叫 <code>/api/market/sync</code> 進行同步。
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. 加權指數 K 線走勢圖 (含 MA 均線、成交量與五段式動態槓桿策略訊號) */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
              {/* 標題與策略控制工具列 */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                    📈 加權指數 K 線走勢與策略訊號
                  </span>
                  <span className="text-xs text-gray-400">
                    (MA5 黃 / MA10 粉 / MA20 紫 / MA60 藍)
                  </span>
                </div>

                {/* 策略切換與兩個說明彈窗按鈕 */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* 策略版本切換 */}
                  <div className="flex items-center bg-gray-100 dark:bg-gray-700/80 p-1 rounded-lg text-xs">
                    {[
                      { id: 'advanced_3x', label: '🔥 3.0x 進階版' },
                      { id: 'steady_2_5x', label: '🛡️ 2.5x 穩健版' },
                      { id: 'off', label: '隱藏訊號' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setStrategyMode(opt.id as MarketStrategyMode)}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          strategyMode === opt.id
                            ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                            : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* 按鈕一：策略邏輯說明彈窗 */}
                  <button
                    onClick={() => setShowLogicModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <BookOpen size={14} />
                    策略邏輯說明
                  </button>

                  {/* 按鈕二：訊號與配比對照彈窗 */}
                  <button
                    onClick={() => setShowAllocationModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800/70 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <PieChart size={14} />
                    訊號與配比對照
                  </button>
                </div>
              </div>

              {/* 當前策略建議檔位與部位配置即時狀態條 */}
              {strategyMode !== 'off' && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-700/80 text-xs">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">目前策略檔位：</span>
                    <span
                      className={`px-2.5 py-1 rounded-md font-bold text-white shadow-xs ${
                        pos.exposure >= 2.5
                          ? 'bg-purple-600'
                          : pos.exposure === 2.0
                          ? 'bg-red-500'
                          : pos.exposure === 1.5
                          ? 'bg-orange-500'
                          : pos.exposure === 1.0
                          ? 'bg-pink-500'
                          : 'bg-emerald-600'
                      }`}
                    >
                      {pos.tierName}
                    </span>
                    <span className="font-bold text-gray-800 dark:text-gray-100">
                      建議配比：{pos.allocationText}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 hidden sm:inline">
                      ({pos.altAllocationText})
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                    <span>
                      最近觸發：<strong className="text-gray-700 dark:text-gray-200">{pos.lastSignalDate}</strong>{' '}
                      <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono font-semibold">
                        {pos.lastSignalText}
                      </span>
                    </span>
                    <span>
                      MA20：<strong className="text-gray-700 dark:text-gray-200">{Math.round(pos.ma20).toLocaleString()}</strong>
                      <span className={`ml-1 font-semibold ${pos.bias20Pct >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        ({pos.bias20Pct >= 0 ? '+' : ''}{pos.bias20Pct}%)
                      </span>
                    </span>
                    <span>
                      5日均分：<strong className="text-gray-700 dark:text-gray-200">{pos.scoreMa5.toFixed(1)}</strong>
                    </span>
                  </div>
                </div>
              )}

              <KLineChart
                data={candles}
                markers={visibleMarkers}
                indicators={{ ma: true, bollinger: false, macd: false, kd: false }}
                initialVisibleBars={120}
                onLoadMore={handleLoadMoreHistory}
              />
            </div>

            {/* 2. 使用者特別要求：自訂多空分數走勢圖 (依狀態變色、標示多空門檻) */}
            {(activeTab === 'all' || activeTab === 'score') && (
              <MarketScoreChart data={historyData} />
            )}

            {/* 3. 三大法人買賣超柱狀圖 */}
            {(activeTab === 'all' || activeTab === 'inst') && (
              <MarketInstChart data={historyData} />
            )}

            {/* 4. 外資台指期未平倉口數走勢圖 */}
            {(activeTab === 'all' || activeTab === 'futures') && (
              <MarketFuturesChart data={historyData} />
            )}

            {/* 5. 大盤融資融券餘額變化圖 */}
            {(activeTab === 'all' || activeTab === 'margin') && (
              <MarketMarginBalanceChart data={historyData} />
            )}
          </div>
        )}
      </main>

      {/* =====================================================================
          彈窗一：策略邏輯說明 Modal (低頻大波段：買支撐、賣高乖離)
      ===================================================================== */}
      {showLogicModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
          onClick={() => setShowLogicModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-3xl w-full max-h-[88vh] overflow-y-auto border border-gray-200 dark:border-gray-700 shadow-2xl p-6 space-y-5 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    台股大盤低頻大波段策略 — 運作邏輯說明
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    結合「5日平均多空分數 (Score_MA5)」與「月線乖離率 (Bias20)」之買低賣高波段系統
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLogicModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 核心理念與工具優勢 */}
            <div className="bg-indigo-50/70 dark:bg-indigo-950/30 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-2">
              <div className="font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                <Zap size={16} /> 核心設計理念：不追高殺低！起漲直接抱正二、回測月線才加碼融資、高乖離逢高鎖利
              </div>
              <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                傳統策略若看「單日分數」進出，容易在長紅大漲高點追買、隔天黑K拉回又砍在低點。本系統改採<strong>「5日均分 (Score_MA5) + 月線乖離率 (Bias20)」</strong>雙重控制：在<strong>剛站上月線起漲點（低乖離）直接一步建倉 2x 正二現股</strong>；<strong>融資 (3x) 只在指數拉回貼近月線支撐收紅時「逢低加碼」</strong>；當<strong>急漲正乖離超過 +5.5% 時「逢高獲利了結融資」</strong>，只要月線未連續跌破就一路死抱整個大波段（平均近一個月才需調整一次）！
              </p>
            </div>

            {/* 決策輸入指標 */}
            <div className="space-y-2">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-1.5">
                📌 每日決策 4 大核心指標
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700">
                  <div className="font-bold text-gray-900 dark:text-gray-100">1. 月線生命線 (MA20) 與乖離率 (Bias20)</div>
                  <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                    <code>Bias20 = (收盤 - MA20) / MA20</code>。用來確保「只在貼近月線低位階時加碼 (`0% ~ +2.2%`)」，並在「正乖離過大 (`≥ +5.5%`) 時逢高退融資鎖利」。
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700">
                  <div className="font-bold text-gray-900 dark:text-gray-100">2. 分數 5 日移動平均 (Score_MA5)</div>
                  <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                    徹底過濾單日外資買賣超忽大忽小的雜訊！只要還在月線之上，單日黑K拉回絕不會被洗出場。
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700">
                  <div className="font-bold text-gray-900 dark:text-gray-100">3. 連續跌破月線確認 (2~3日確認制)</div>
                  <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                    多頭常有單日假跌破月線洗盤。系統要求「連續 2~3 日跌破 MA20 且 5日均分轉弱」才降檔或清倉。
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700">
                  <div className="font-bold text-gray-900 dark:text-gray-100">4. 大盤融資日增減 (MarginDiff)</div>
                  <div className="text-gray-500 dark:text-gray-400 mt-0.5">
                    用於左側「破底翻」抄底確認：暴跌後散戶融資斷頭減少（≤ 0）且收盤站回 5 日線，精準抄底。
                  </div>
                </div>
              </div>
            </div>

            {/* 四段式低頻波段進出場法則 */}
            <div className="space-y-3">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                ⚙️ 四段式低頻波段進出場條件（買在起漲與支撐、賣在高乖離與破線）
              </h3>

              <div className="space-y-2.5 text-xs">
                {/* 規則 1 */}
                <div className="p-3.5 rounded-xl border-l-4 border-red-500 bg-gray-50 dark:bg-gray-900/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-red-600 dark:text-red-400 text-sm">
                      ① 波段起漲建倉：0x ➔ 2.0x 或 1.0x（Buy x2 / Buy x1）
                    </span>
                    <span className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-semibold">
                      100% 正二現股 (一步到位)
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                    <li>
                      <strong>初站上月線起漲點（直接 `Buy x2`）</strong>：當空手時，大盤<code>收盤站上 MA20</code>、<code>5日均分 Score_MA5 ≥ 53</code>，且<code>月線正乖離 ≤ +3.5%</code>（剛起漲尚未暴漲），直接買進 <strong>100% 正二現股 (2.0x)</strong>，不用分好幾天追高！
                    </li>
                    <li>
                      <strong>高乖離站上月線或左側破底翻（先建 `Buy x1`）</strong>：若站上月線時乖離已大 (&gt;3.5%)，或月線下恐慌急跌後單日急彈 +15分、融資斷頭減少且站上 5 日線（<code>Buy x1(底)</code>），先買進 <strong>50% 正二 + 50% 現金 (1.0x)</strong>。
                    </li>
                  </ul>
                </div>

                {/* 規則 2 */}
                <div className="p-3.5 rounded-xl border-l-4 border-purple-500 bg-gray-50 dark:bg-gray-900/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-600 dark:text-purple-400 text-sm">
                      ② 多頭回測月線支撐「逢低加碼融資」：➔ 3.0x / 2.5x（Buy x3）
                    </span>
                    <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-semibold">
                      67% 正二現股 + 33% 正二融資
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300">
                    <strong>絕不在長紅暴漲高點追買融資！</strong>只有當大盤處於多頭趨勢（<code>MA20 月線向上</code> 且 <code>Score_MA5 ≥ 56</code>），且指數<strong>拉回貼近月線支撐低位階（乖離率收斂至 <code>0% ~ +2.2%</code>）並收紅 K 止跌轉強（<code>Score ≥ 60</code>）</strong>時，才在支撐處開融資升至 3.0x！
                  </p>
                </div>

                {/* 規則 3 */}
                <div className="p-3.5 rounded-xl border-l-4 border-amber-500 bg-gray-50 dark:bg-gray-900/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-600 dark:text-amber-400 text-sm">
                      ③ 急漲正乖離過大「逢高鎖利退融資」：3x ➔ 2.0x（Sell x2(高檔鎖利)）
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">
                      賣在波段高點！
                    </span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300">
                    當持有 3x 融資滿倉，而指數急漲遠離月線（<strong>月線正乖離率 <code>Bias20 ≥ +5.5%</code></strong>）且短線出現收黑 K 或分數回落 (&lt; 68) 時，<strong>在波段高點將融資全數獲利了結</strong>，退回 100% 正二現股 (2x) 繼續抱波段。
                  </p>
                </div>

                {/* 規則 4 */}
                <div className="p-3.5 rounded-xl border-l-4 border-emerald-500 bg-gray-50 dark:bg-gray-900/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      ④ 連續跌破月線防守與波段清倉：➔ 1.0x / 0x（Sell x1 / Sell All）
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                      波段結束退場
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
                    <li>
                      <strong>波段續抱原則</strong>：只要收盤未連續跌破 MA20 月線，就算中間出現單日長黑或分數波動，<strong>2x 正二現股一股都不賣，可連續抱數個月吃完整波段</strong>！
                    </li>
                    <li>
                      <strong>Sell x1（連破月線減半防守）</strong>：連續 2 日收盤跌破 MA20 且 <code>Score_MA5</code> 落在 <code>42 ~ 48</code> 整理區，先降回 50% 正二 + 50% 現金 (1x)。
                    </li>
                    <li>
                      <strong>Sell All（波段趨勢結束清倉）</strong>：<code>連續 2 日跌破 MA20 且 Score_MA5 &lt; 42</code>（或連 3 日破 MA20 且 <code>Score_MA5 &lt; 45</code>），確認波段結束，全數清倉抱 100% 現金避開主跌段！
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 實戰 SOP 提醒：盤後出訊號，隔日 (T+1) 怎麼買賣？ */}
            <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-2.5 text-xs text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-300 text-sm">
                <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                🕒 盤後才出完整分數，實戰該怎麼買賣？（平均近 1 個月才動一次！）
              </div>
              <p className="leading-relaxed">
                系統於每日 <strong>16:00</strong> 先結算 90% 權重（價量+法人+期貨），並於 <strong>22:00</strong> 補齊大盤融資餘額（10% 權重）完成最終算分。由於本策略屬於<strong>低頻大波段策略</strong>（兩年僅約 25~28 次調倉，平均近一個月才換檔一次），一律採<strong>「當晚 22:00 後看訊號 ➔ 隔日 (T+1) 早上 09:00~09:05 開盤下單」</strong>即可：
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-1">
                <li>
                  <strong>遇到「減碼 / 清倉訊號」（Sell x2(高檔鎖利) / Sell x1 / Sell All）👉 隔日早盤直接賣出：</strong>
                  高檔鎖利或破線清倉皆於隔天早上 <strong>09:00~09:05 開盤直接依比例賣出</strong>。
                </li>
                <li>
                  <strong>遇到「買進 / 加碼訊號」（Buy x1 / Buy x2 / Buy x3）👉 隔日早盤買進：</strong>
                  因為本系統只在「剛站上月線低乖離」或「回測月線支撐」時才會發出買進訊號，位階本身就很安全，隔日早上 <strong>09:00~09:05 開盤買進</strong>即可（若隔日巧遇美股暴漲跳空超過 +2%，可早盤買一半、13:20 尾盤買另一半）。
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          彈窗二：訊號與配比對照 Modal (各訊號文字對應配比與歷史觸發紀錄)
      ===================================================================== */}
      {showAllocationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
          onClick={() => setShowAllocationModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[88vh] overflow-y-auto border border-gray-200 dark:border-gray-700 shadow-2xl p-6 space-y-5 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                  <PieChart size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    K 線訊號文字 (x1 ~ x3) 與資金配比速查表
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    對照圖表上的買賣標記，一眼確認每種訊號應持有的「0050正二現股、正二融資、現金」比例
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAllocationModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 目前所在檔位高亮提示 */}
            <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-purple-600 dark:text-purple-400" />
                  <span className="text-xs font-bold text-purple-900 dark:text-purple-300">
                    當前大盤最新對應檔位：{pos.tierName}
                  </span>
                </div>
                <div className="text-sm font-black text-gray-900 dark:text-white">
                  {pos.allocationText}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  最近一次訊號：<span className="font-semibold text-gray-700 dark:text-gray-200">{pos.lastSignalDate} ({pos.lastSignalText})</span> — {pos.lastSignalReason}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-xs">
                <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                  <div className="text-gray-400 text-[10px]">正二現股</div>
                  <div className="font-black text-red-500 text-sm">{pos.spot2xPct}%</div>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                  <div className="text-gray-400 text-[10px]">正二融資自備款</div>
                  <div className="font-black text-purple-500 text-sm">{pos.margin2xPct}%</div>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                  <div className="text-gray-400 text-[10px]">保留現金</div>
                  <div className="font-black text-emerald-500 text-sm">{pos.cashPct}%</div>
                </div>
              </div>
            </div>

            {/* 訊號與資金配比總表 */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700/70 text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2.5 px-3 font-bold">K 線訊號文字</th>
                    <th className="py-2.5 px-3 font-bold">目標曝險</th>
                    <th className="py-2.5 px-3 font-bold">標準配比 (0050正二 + 現金 + 融資)</th>
                    <th className="py-2.5 px-3 font-bold">以 100 萬本金為例 (實戰部位)</th>
                    <th className="py-2.5 px-3 font-bold">觸發時機 / 維持率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700/70">
                  {/* Buy x1 / Buy x1(底) */}
                  <tr className={pos.exposure === 1.0 && pos.lastSignalText.startsWith('Buy') ? 'bg-pink-50/40 dark:bg-pink-950/20' : ''}>
                    <td className="py-3 px-3 font-mono font-bold">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-pink-500 text-white">
                        ▲ Buy x1 / Buy x1(底)
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">1.0x (左側抄底 / 試單)</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-gray-900 dark:text-gray-100">50% 正二現股 + 50% 現金</div>
                      <div className="text-[11px] text-gray-400">（或 100% 買進 0050 現股）</div>
                    </td>
                    <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                      買 <strong>50 萬</strong> 正二現股 + 留 <strong>50 萬</strong> 現金
                    </td>
                    <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                      恐慌急跌破底翻且站上5日線（0 融資風險）
                    </td>
                  </tr>

                  {/* Buy x2 */}
                  <tr className={pos.exposure === 2.0 && pos.lastSignalText === 'Buy x2' ? 'bg-red-50/40 dark:bg-red-950/20' : ''}>
                    <td className="py-3 px-3 font-mono font-bold">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500 text-white">
                        ▲ Buy x2
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">2.0x (波段起漲主力倉)</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-gray-900 dark:text-gray-100">100% 正二現股 + 0% 現金</div>
                      <div className="text-[11px] text-gray-400">初站上月線起漲點一步到位買滿正二現股</div>
                    </td>
                    <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                      持有 <strong>100 萬</strong> 正二現股（等效 200 萬大盤）
                    </td>
                    <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                      剛站上月線 (乖離≤3.5%) 且5日均分≥53
                    </td>
                  </tr>

                  {/* Buy x3 / Buy x2.5 */}
                  <tr className={pos.exposure >= 2.5 ? 'bg-purple-50/40 dark:bg-purple-950/20' : ''}>
                    <td className="py-3 px-3 font-mono font-bold">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-600 text-white">
                        ▲ Buy x3 / Buy x2.5
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-purple-600 dark:text-purple-400">
                      3.0x 進階 / 2.5x 穩健 (回檔逢低加碼)
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-gray-900 dark:text-gray-100">
                        【3.0x】67% 正二現股 + 33% 自備款正二融資
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        【2.5x】83% 正二現股 + 17% 自備款正二融資
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                      <div>【3.0x】<strong>67 萬</strong> 正二現股 + <strong>33 萬</strong>自備款融資買 <strong>83 萬</strong>正二（總持倉 150 萬正二）</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        【2.5x】<strong>83 萬</strong> 正二現股 + <strong>17 萬</strong>自備款融資買 <strong>42 萬</strong>正二（總持倉 125 萬正二）
                      </div>
                    </td>
                    <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                      <div>多頭回測月線低乖離 (≤2.2%) 收紅加碼</div>
                      <div>維持率 <strong>250% / 357%</strong></div>
                    </td>
                  </tr>

                  {/* Sell x2(高檔鎖利) */}
                  <tr className={pos.exposure === 2.0 && pos.lastSignalText.startsWith('Sell x2') ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}>
                    <td className="py-3 px-3 font-mono font-bold">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 text-white">
                        ▼ Sell x2(高檔鎖利)
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">2.0x (高乖離獲利了結融資)</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-gray-900 dark:text-gray-100">100% 正二現股 (退掉全數融資)</div>
                      <div className="text-[11px] text-gray-400">急漲遠離月線時在波段高點把融資賣出鎖利，保留現股續抱</div>
                    </td>
                    <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                      持有 <strong>100 萬</strong> 正二現股 + <strong>0</strong> 融資
                    </td>
                    <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                      月線正乖離 ≥ +5.5% 逢高鎖利
                    </td>
                  </tr>

                  {/* Sell x1 */}
                  <tr className={pos.exposure === 1.0 && pos.lastSignalText === 'Sell x1' ? 'bg-cyan-50/40 dark:bg-cyan-950/20' : ''}>
                    <td className="py-3 px-3 font-mono font-bold">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500 text-white">
                        ▼ Sell x1
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">1.0x (跌破月線減半防守)</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-gray-900 dark:text-gray-100">50% 正二現股 + 50% 現金</div>
                      <div className="text-[11px] text-gray-400">連續兩日跌破月線 MA20 但 5日均分仍在 42~48，先砍半防守</div>
                    </td>
                    <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                      持有 <strong>50 萬</strong> 正二現股 + 留 <strong>50 萬</strong> 現金
                    </td>
                    <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                      進可攻、退可守
                    </td>
                  </tr>

                  {/* Sell All */}
                  <tr className={pos.exposure === 0 ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''}>
                    <td className="py-3 px-3 font-mono font-bold">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 text-white">
                        ▼ Sell All
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-emerald-600 dark:text-emerald-400">0x (波段結束清倉)</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-gray-900 dark:text-gray-100">100% 現金 (全數出清觀望)</div>
                      <div className="text-[11px] text-gray-400">連續跌破月線且 5日均分 &lt; 42，波段結束避開主跌段</div>
                    </td>
                    <td className="py-3 px-3 text-gray-700 dark:text-gray-300">
                      持有 <strong>100 萬</strong> 現金（0 持股）
                    </td>
                    <td className="py-3 px-3 text-gray-500 dark:text-gray-400">
                      等待下次起漲 Buy x2 或破底翻
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 近期實際觸發訊號歷史列表 */}
            {strategyResult.events.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-bold text-gray-900 dark:text-white text-xs flex items-center justify-between">
                  <span>🕒 近期大盤實際觸發訊號紀錄（最新 10 筆）</span>
                  <span className="text-gray-400 font-normal">可對照 K 線圖標記位置</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {strategyResult.events
                    .slice(-10)
                    .reverse()
                    .map((ev, idx) => (
                      <div
                        key={`${ev.date}-${idx}`}
                        className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 flex items-start justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{ev.date}</span>
                            <span
                              className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold text-white"
                              style={{ backgroundColor: ev.color }}
                            >
                              {ev.signalText}
                            </span>
                            <span className="text-gray-400 text-[11px]">
                              ({ev.fromExposure}x ➔ {ev.toExposure}x)
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400">{ev.reason}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono font-semibold text-gray-800 dark:text-gray-200">
                            {ev.close.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            乖離 {ev.bias20Pct >= 0 ? '+' : ''}{ev.bias20Pct}% | 評分 {ev.score}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
