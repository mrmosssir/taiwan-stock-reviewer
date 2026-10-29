import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Activity, ShieldAlert, BarChart3, Layers } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { KLineChart } from '../components/KLineChart';
import { MarketScoreChart } from '../components/MarketScoreChart';
import { MarketInstChart } from '../components/MarketInstChart';
import { MarketFuturesChart } from '../components/MarketFuturesChart';
import { MarketMarginBalanceChart } from '../components/MarketMarginBalanceChart';
import { fetchMarketHistory, fetchMarketLatest } from '../api';
import type { MarketDailyRecord, StockCandle } from '../api';

export const MarketOverview = () => {
  const navigate = useNavigate();
  const [historyData, setHistoryData] = useState<MarketDailyRecord[]>([]);
  const [latestData, setLatestData] = useState<MarketDailyRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<string>('120');
  const [activeTab, setActiveTab] = useState<'all' | 'score' | 'inst' | 'futures' | 'margin'>('all');

  const loadData = async (days: string) => {
    setIsLoading(true);
    try {
      const [history, latest] = await Promise.all([
        fetchMarketHistory(days),
        fetchMarketLatest()
      ]);
      setHistoryData(history);
      setLatestData(latest || (history.length > 0 ? history[history.length - 1] : null));
    } catch (e) {
      console.error('Failed to load market data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(timeRange);
  }, [timeRange]);

  // 將大盤資料轉換為 KLineChart 所需的 StockCandle 格式
  const candles: StockCandle[] = historyData.map((d) => ({
    date: d.date,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
  }));

  const current = latestData || (historyData.length > 0 ? historyData[historyData.length - 1] : null);

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
              onClick={() => loadData(timeRange)}
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

          {/* 時間跨度選擇 */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-400 mr-1">歷史週期：</span>
            {[
              { label: '30 天', value: '30' },
              { label: '60 天', value: '60' },
              { label: '120 天', value: '120' },
              { label: '240 天 (1年)', value: '240' },
              { label: '全部歷史', value: 'all' },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setTimeRange(item.value)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  timeRange === item.value
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
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
            {/* 1. 加權指數 K 線走勢圖 (含 MA 均線與成交量) */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                    📈 加權指數 K 線走勢圖
                  </span>
                  <span className="text-xs text-gray-400">
                    (MA5 黃 / MA20 紫 / MA60 藍)
                  </span>
                </div>
              </div>
              <KLineChart
                data={candles}
                indicators={{ ma: true, bollinger: false, macd: false, kd: false }}
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
    </div>
  );
};
