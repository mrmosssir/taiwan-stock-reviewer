import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  fetchTicker, 
  fetchStockHistoryFull,
  fetchMarginTrading,
  fetchFinancialStatements,
  fetchDividends,
  adjustCandles,
} from '../api';
import type { 
  StockTicker, 
  StockCandle,
  InstitutionalData,
  MarginData,
  ComprehensiveFinancials,
  DividendData
} from '../api';
import { KLineChart } from '../components/KLineChart';
import { MarginChart } from '../components/MarginChart';
import { ArrowLeft, Users, CreditCard, PieChart, TrendingUp, BarChart3, Wallet, Star, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { calculateSignals, SIGNAL_STRATEGIES } from '../utils/signals';
import { aggregateCandles, aggregateInstitutional } from '../utils/resample';
import { ThemeToggle } from '../components/ThemeToggle';
import { useWatchlist } from '../context/WatchlistContext';

const WatchlistDropdown = ({ symbol }: { symbol: string }) => {
  const { folders, getFoldersContainingStock, addStockToFolder, removeStockFromFolder } = useWatchlist();
  const [isOpen, setIsOpen] = useState(false);
  
  const inFolders = getFoldersContainingStock(symbol);
  const isStarred = inFolders.length > 0;
  
  return (
    <div className="relative inline-block shrink-0">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center"
        title="加入/移除自選股"
      >
        <Star size={20} className={isStarred ? "fill-yellow-400 text-yellow-400" : "text-gray-400 dark:text-gray-500"} />
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 z-30 py-1">
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 font-normal">
              加入至資料夾
            </div>
            {folders.map(folder => {
              const inFolder = inFolders.includes(folder.id);
              return (
                <button
                  key={folder.id}
                  onClick={() => {
                    if (inFolder) {
                      removeStockFromFolder(folder.id, symbol);
                    } else {
                      addStockToFolder(folder.id, symbol);
                    }
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between font-normal"
                >
                  <span className="text-gray-700 dark:text-gray-200 truncate pr-2">{folder.name}</span>
                  {inFolder && <span className="text-blue-500 shrink-0">✓</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  );
};

export const StockDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const [ticker, setTicker] = useState<StockTicker | null>(null);
  const [rawCandles, setRawCandles] = useState<StockCandle[]>([]);
  const [dividends, setDividends] = useState<DividendData[]>([]);
  const [institutional, setInstitutional] = useState<InstitutionalData[]>([]);
  const [margin, setMargin] = useState<MarginData[]>([]);
  const [financials, setFinancials] = useState<ComprehensiveFinancials>({
    revenue: [], grossMargin: [], operatingMargin: [], netIncome: [], eps: [], debtRatio: [], roe: [], ocf: []
  });
  
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('D');
  const [indicators, setIndicators] = useState({
    ma: true,
    bollinger: false,
    macd: false,
    kd: false,
  });
  const [isAdjusted, setIsAdjusted] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState(SIGNAL_STRATEGIES[0].id);
  const [showAllConcepts, setShowAllConcepts] = useState(false);

  useEffect(() => {
    setShowAllConcepts(false);
  }, [symbol]);

  const baseCandles = useMemo(() => {
    return isAdjusted ? adjustCandles(rawCandles, dividends) : rawCandles;
  }, [isAdjusted, rawCandles, dividends]);

  const displayCandles = useMemo(() => {
    return aggregateCandles(baseCandles, timeframe);
  }, [baseCandles, timeframe]);

  const displayInstitutional = useMemo(() => {
    return aggregateInstitutional(institutional, timeframe);
  }, [institutional, timeframe]);

  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const handleThemeChange = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    window.addEventListener('theme-change', handleThemeChange);
    // Also listen for potential manual class changes
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('theme-change', handleThemeChange);
      observer.disconnect();
    };
  }, []);

  const [finTab, setFinTab] = useState<'monthly' | 'profit' | 'health'>('monthly');

  // Calculate signals (完整歷史資料直接計算，確保狀態機與後端完全對齊)
  const markers = useMemo(() => {
    return calculateSignals(activeStrategy, displayCandles, displayInstitutional, ticker, financials);
  }, [activeStrategy, displayCandles, displayInstitutional, ticker, financials]);

  const initialVisibleBars = timeframe === 'M' ? 36 : timeframe === 'W' ? 60 : 120;

  useEffect(() => {
    const loadAllData = async () => {
      if (!symbol) return;
      setLoading(true);
      try {
        const [tickerData, historyData, marginData, finData, divs] = await Promise.all([
          fetchTicker(symbol),
          fetchStockHistoryFull(symbol),
          fetchMarginTrading(symbol, 360),
          fetchFinancialStatements(symbol),
          fetchDividends(symbol, 3600)
        ]);

        setTicker(tickerData);
        setRawCandles(historyData.candles);
        setDividends(divs);
        setInstitutional(historyData.institutional);
        setMargin(marginData);
        setFinancials(finData as ComprehensiveFinancials);
      } catch (error) {
        console.error('Error fetching comprehensive data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, [symbol]);

  if (loading && !ticker && rawCandles.length === 0) return <div className="p-8 flex justify-center"><div className="animate-spin text-blue-600 h-8 w-8 border-4 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 pb-20 transition-colors duration-200">
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
            <Link to="/" className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors shrink-0">
              <ArrowLeft size={22} />
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <h1 className="text-base sm:text-xl font-bold dark:text-white truncate">
                {ticker?.symbol} {ticker?.name}
              </h1>
              <span className="hidden sm:inline-block text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded shrink-0">
                {ticker?.market} {ticker?.type}
              </span>
              {ticker && <WatchlistDropdown symbol={ticker.symbol} />}
            </div>
          </div>
          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* 所屬概念題材標籤（手機單行可左右滑動，不擠壓 K 線第一屏） */}
        {ticker?.concepts && ticker.concepts.length > 0 && (
          <div className="mb-3 sm:mb-4 flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap pb-1 sm:pb-0 scrollbar-hide">
            <span className="text-[11px] sm:text-xs font-medium text-gray-400 dark:text-gray-500 mr-0.5 shrink-0">
              概念題材：
            </span>
            {ticker.concepts.map((c) => (
              <Link
                key={c.id}
                to={`/concepts/${encodeURIComponent(c.id)}`}
                title={c.detail || c.name}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  c.kind === 'theme'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200/80 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60 dark:hover:bg-indigo-900/50'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/70 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'
                }`}
              >
                <span>#{c.name}</span>
              </Link>
            ))}
          </div>
        )}

        {/* K-Line Chart Section */}
        <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-4 sm:mb-6 flex flex-wrap gap-3 sm:gap-4 items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
            {['D', 'W', 'M'].map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                  timeframe === t ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t === 'D' ? '日線' : t === 'W' ? '週線' : '月線'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 w-full sm:w-auto">
            <select
              value={activeStrategy}
              onChange={(e) => setActiveStrategy(e.target.value)}
              className="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs sm:text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-1.5 outline-none cursor-pointer flex-1 sm:flex-none"
            >
              {SIGNAL_STRATEGIES.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <div className="hidden sm:block h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer dark:text-gray-300 font-medium">
                <input 
                  type="checkbox" 
                  checked={isAdjusted} 
                  onChange={e => setIsAdjusted(e.target.checked)}
                  className="rounded text-purple-600"
                />
                還原K線
              </label>
              <div className="hidden sm:block h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
              {['ma', 'bollinger', 'macd'].map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer capitalize dark:text-gray-300">
                  <input 
                    type="checkbox" 
                    checked={(indicators as any)[key]} 
                    onChange={e => setIndicators({...indicators, [key]: e.target.checked})}
                    className="rounded text-blue-600"
                  />
                  {key === 'ma' ? '均線' : key === 'bollinger' ? '布林' : 'MACD'}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-2.5 sm:p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 sm:mb-8">
           <KLineChart 
             data={displayCandles} 
             indicators={indicators} 
             markers={markers} 
             initialVisibleBars={initialVisibleBars}
             isDarkMode={isDarkMode} 
           />
        </div>

        {/* 概念題材與產業定位說明 */}
        {ticker?.concepts && ticker.concepts.length > 0 && (() => {
          const TIER_LABELS: Record<string, string> = {
            upstream: '上游',
            midstream: '中游',
            downstream: '下游',
          };
          const conceptsList = ticker.concepts;
          const visibleConcepts = showAllConcepts ? conceptsList : conceptsList.slice(0, 3);
          const hasMoreConcepts = conceptsList.length > 3;

          return (
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 sm:mb-8">
              <div className="flex items-center justify-between mb-4 border-l-4 border-indigo-500 pl-3">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 font-bold">
                  <Sparkles size={19} className="text-indigo-500" />
                  <h3>概念題材與產業定位</h3>
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
                    ({conceptsList.length})
                  </span>
                </div>
                {hasMoreConcepts && (
                  <button
                    onClick={() => setShowAllConcepts((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    <span>{showAllConcepts ? '收合' : `展開全部 ${conceptsList.length} 項`}</span>
                    {showAllConcepts ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-700/70">
                {visibleConcepts.map((c) => {
                  const tierLabel = c.tier ? TIER_LABELS[c.tier] || c.tier : null;
                  return (
                    <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                        <Link
                          to={`/concepts/${encodeURIComponent(c.id)}`}
                          className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          #{c.name}
                        </Link>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            c.kind === 'theme'
                              ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {c.kind === 'theme' ? '概念' : '產業鏈'}
                        </span>
                        {tierLabel && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                            {tierLabel}
                          </span>
                        )}
                        {c.stageRole === 'primary' && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            主力
                          </span>
                        )}
                      </div>
                      {c.detail ? (
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                          {c.detail}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          尚無詳細產業說明
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasMoreConcepts && !showAllConcepts && (
                <button
                  onClick={() => setShowAllConcepts(true)}
                  className="mt-3 w-full py-2 rounded-xl text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/40 transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <span>顯示其餘 {conceptsList.length - 3} 項概念與產業說明</span>
                  <ChevronDown size={14} />
                </button>
              )}
            </div>
          );
        })()}

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Institutional Investors */}
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4 border-l-4 border-blue-500 pl-3">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 font-bold">
                <Users size={20} className="text-blue-500" />
                <h3>三大法人買賣超 (張)</h3>
              </div>
              {institutional.length > 0 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  最後更新: {institutional[institutional.length - 1].date}
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {institutional.length > 0 ? (
                institutional.slice().reverse().map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{item.date}</span>
                    <span className={`text-sm font-bold ${item.net >= 0 ? 'text-red-500' : 'text-green-500 dark:text-green-400'}`}>
                      {item.net >= 0 ? '+' : ''}{item.net.toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">暫無籌碼資料</div>
              )}
            </div>
          </div>

          {/* Margin Trading */}
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-1 mb-4 border-l-4 border-orange-500 pl-3">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 font-bold">
                <CreditCard size={20} className="text-orange-500" />
                <h3>融資融券趨勢 (近一個月)</h3>
              </div>
              {margin.length > 0 && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  資料日期: {margin[margin.length - 1].date}
                </span>
              )}
            </div>
            <div className="mb-6 h-[200px]">
              {margin.length > 0 ? (
                <MarginChart data={margin} />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                  暫無圖表資料
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 font-medium">
                  <tr>
                    <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 px-2 py-2">日期</th>
                    <th className="px-2 py-2 text-orange-600 dark:text-orange-400">融資餘額</th>
                    <th className="px-2 py-2">增減</th>
                    <th className="px-2 py-2 text-blue-600 dark:text-blue-400">融券餘額</th>
                    <th className="px-2 py-2">增減</th>
                    <th className="px-2 py-2">券資比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {margin.slice().reverse().slice(0, 5).map((row, i) => (
                    <tr key={i} className="group hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 px-2 py-2 text-gray-400 dark:text-gray-500 font-mono">{row.date.slice(5)}</td>
                      <td className="px-2 py-2 font-medium dark:text-gray-200">{row.marginBalance.toLocaleString()}</td>
                      <td className={`px-2 py-2 font-bold ${row.marginChange >= 0 ? 'text-red-500' : 'text-green-500 dark:text-green-400'}`}>
                        {row.marginChange > 0 ? '+' : ''}{row.marginChange.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 font-medium dark:text-gray-200">{row.shortBalance.toLocaleString()}</td>
                      <td className={`px-2 py-2 font-bold ${row.shortChange >= 0 ? 'text-red-500' : 'text-green-500 dark:text-green-400'}`}>
                        {row.shortChange > 0 ? '+' : ''}{row.shortChange.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-gray-600 dark:text-gray-400 font-medium">{row.ratio.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Financial Statements */}
        {(() => {
          const summary = financials.summary;
          const monthlyRev = financials.monthlyRevenue || [];
          const quarterly = financials.quarterly || [];
          const latestClose =
            rawCandles.length > 0
              ? rawCandles[rawCandles.length - 1].close
              : ticker?.lastClose ?? null;
          const peRatio =
            latestClose && latestClose > 0 && summary?.ttmEps && summary.ttmEps > 0
              ? latestClose / summary.ttmEps
              : null;

          const formatMoney = (val: number | null | undefined): string => {
            if (val === null || val === undefined || !Number.isFinite(val)) return '-';
            const abs = Math.abs(val);
            if (abs >= 1e8) return `${(val / 1e8).toFixed(2)} 億`;
            return `${(val / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })} 百萬`;
          };

          const formatPctBadge = (pct: number | null | undefined, suffix = '%') => {
            if (pct === null || pct === undefined || !Number.isFinite(pct)) {
              return <span className="text-gray-400 dark:text-gray-500">-</span>;
            }
            const isPos = pct > 0;
            const isNeg = pct < 0;
            return (
              <span
                className={
                  isPos
                    ? 'text-red-500 font-semibold'
                    : isNeg
                    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                    : 'text-gray-500 dark:text-gray-400'
                }
              >
                {isPos ? '+' : ''}
                {pct.toFixed(2)}
                {suffix}
              </span>
            );
          };

          const recent12Months = monthlyRev.slice(-12);
          const maxMonthRev = recent12Months.reduce((m, r) => Math.max(m, r.revenue || 0), 0);

          return (
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 font-bold border-l-4 border-purple-500 pl-3">
                  <PieChart size={20} className="text-purple-500" />
                  <h3>基本面與財務分析</h3>
                </div>
                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg self-start max-w-full overflow-x-auto scrollbar-hide whitespace-nowrap">
                  <button
                    onClick={() => setFinTab('monthly')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                      finTab === 'monthly'
                        ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <BarChart3 size={14} /> 月營收動能
                  </button>
                  <button
                    onClick={() => setFinTab('profit')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                      finTab === 'profit'
                        ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <TrendingUp size={14} /> 獲利與三率
                  </button>
                  <button
                    onClick={() => setFinTab('health')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                      finTab === 'health'
                        ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <Wallet size={14} /> 體質與現金流
                  </button>
                </div>
              </div>

              {/* 核心基本面摘要卡 (4 格) */}
              {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                  {/* 1. 最新月營收 */}
                  <div className="p-3 sm:p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/70">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                      <span>最新月營收</span>
                      {summary.latestRevenuePeriod && (
                        <span className="font-mono text-[10px]">{summary.latestRevenuePeriod}</span>
                      )}
                    </div>
                    <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                      {formatMoney(summary.latestRevenue)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                      <span className="text-gray-500 dark:text-gray-400">
                        YoY {formatPctBadge(summary.latestRevenueYoyPct)}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        MoM {formatPctBadge(summary.latestRevenueMomPct)}
                      </span>
                    </div>
                  </div>

                  {/* 2. 估值與近四季 EPS */}
                  <div className="p-3 sm:p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/70">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                      <span>本益比 (PE)</span>
                      {summary.latestQuarter && (
                        <span className="font-mono text-[10px]">{summary.latestQuarter}</span>
                      )}
                    </div>
                    <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                      {peRatio !== null ? `${peRatio.toFixed(1)} 倍` : '-'}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      近四季 EPS：
                      <strong className="text-gray-700 dark:text-gray-200">
                        {summary.ttmEps !== null && summary.ttmEps !== undefined
                          ? `${summary.ttmEps.toFixed(2)} 元`
                          : '-'}
                      </strong>
                    </div>
                  </div>

                  {/* 3. 最新毛利率 / 營益率 */}
                  <div className="p-3 sm:p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/70">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                      <span>毛利率 / 營益率</span>
                      {summary.grossMarginQoqDiff !== null && summary.grossMarginQoqDiff !== undefined && (
                        <span className="text-[10px]">
                          季 {formatPctBadge(summary.grossMarginQoqDiff, 'pt')}
                        </span>
                      )}
                    </div>
                    <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                      {summary.latestGrossMargin !== null && summary.latestGrossMargin !== undefined
                        ? `${summary.latestGrossMargin.toFixed(1)}%`
                        : '-'}
                      <span className="text-xs font-normal text-gray-400 mx-1">/</span>
                      <span className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-200">
                        {summary.latestOperatingMargin !== null && summary.latestOperatingMargin !== undefined
                          ? `${summary.latestOperatingMargin.toFixed(1)}%`
                          : '-'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      淨利率：
                      <strong className="text-gray-700 dark:text-gray-200">
                        {summary.latestNetMargin !== null && summary.latestNetMargin !== undefined
                          ? `${summary.latestNetMargin.toFixed(1)}%`
                          : '-'}
                      </strong>
                    </div>
                  </div>

                  {/* 4. 年化 ROE 與負債比 */}
                  <div className="p-3 sm:p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/70">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                      <span>年化 ROE</span>
                      <span className="text-[10px]">近4季推算</span>
                    </div>
                    <div
                      className={`text-base sm:text-lg font-bold ${
                        summary.annualizedRoe !== null && summary.annualizedRoe !== undefined && summary.annualizedRoe >= 15
                          ? 'text-red-500'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {summary.annualizedRoe !== null && summary.annualizedRoe !== undefined
                        ? `${summary.annualizedRoe.toFixed(1)}%`
                        : '-'}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      負債比：
                      <strong
                        className={
                          summary.latestDebtRatio !== null && summary.latestDebtRatio !== undefined && summary.latestDebtRatio > 60
                            ? 'text-red-500'
                            : 'text-gray-700 dark:text-gray-200'
                        }
                      >
                        {summary.latestDebtRatio !== null && summary.latestDebtRatio !== undefined
                          ? `${summary.latestDebtRatio.toFixed(1)}%`
                          : '-'}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 1: 月營收動能 */}
              {finTab === 'monthly' && (
                <div className="space-y-4">
                  {recent12Months.length > 0 ? (
                    <>
                      {/* 近 12 個月營收長條圖 */}
                      <div className="p-3 sm:p-4 rounded-xl bg-gray-50/70 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/60">
                        <div className="flex items-center justify-between mb-3 text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium">近 12 個月營收趨勢（紅柱：YoY 成長／綠柱：YoY 衰退）</span>
                          {summary?.latestYtdYoyPct !== null && summary?.latestYtdYoyPct !== undefined && (
                            <span>今年累計 YoY {formatPctBadge(summary.latestYtdYoyPct)}</span>
                          )}
                        </div>
                        <div className="flex items-end gap-1.5 sm:gap-2 h-28 sm:h-32 pt-4">
                          {recent12Months.map((m) => {
                            const heightPct = maxMonthRev > 0 ? Math.max(8, (m.revenue / maxMonthRev) * 100) : 8;
                            const isGrow = (m.yoyPct ?? 0) >= 0;
                            return (
                              <div key={m.period} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end group">
                                <div
                                  title={`${m.period}：${formatMoney(m.revenue)}（YoY ${m.yoyPct !== null ? `${m.yoyPct > 0 ? '+' : ''}${m.yoyPct.toFixed(1)}%` : '-'}）`}
                                  style={{ height: `${heightPct}%` }}
                                  className={`w-full max-w-[28px] rounded-t-md transition-all ${
                                    isGrow
                                      ? 'bg-red-400/85 dark:bg-red-500/80 group-hover:bg-red-500'
                                      : 'bg-emerald-400/85 dark:bg-emerald-500/80 group-hover:bg-emerald-500'
                                  }`}
                                />
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate">
                                  {m.period.slice(5)}月
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 月營收明細表 */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm text-left whitespace-nowrap">
                          <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                            <tr>
                              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 px-3 sm:px-4 py-2.5 rounded-l-lg">月份</th>
                              <th className="px-3 sm:px-4 py-2.5 text-purple-600 dark:text-purple-400 font-bold">單月營收</th>
                              <th className="px-3 sm:px-4 py-2.5">月增率 (MoM)</th>
                              <th className="px-3 sm:px-4 py-2.5">年增率 (YoY)</th>
                              <th className="px-3 sm:px-4 py-2.5 rounded-r-lg">累計年增率</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                            {monthlyRev.slice().reverse().map((m) => (
                              <tr key={m.period} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group">
                                <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 px-3 sm:px-4 py-2.5 font-mono font-medium text-gray-900 dark:text-white">
                                  {m.period}
                                </td>
                                <td className="px-3 sm:px-4 py-2.5 font-mono font-semibold text-gray-900 dark:text-gray-100">
                                  {formatMoney(m.revenue)}
                                </td>
                                <td className="px-3 sm:px-4 py-2.5 font-mono">{formatPctBadge(m.momPct)}</td>
                                <td className="px-3 sm:px-4 py-2.5 font-mono">{formatPctBadge(m.yoyPct)}</td>
                                <td className="px-3 sm:px-4 py-2.5 font-mono">{formatPctBadge(m.ytdYoyPct)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">暫無月營收資料</div>
                  )}
                </div>
              )}

              {/* Tab 2: 獲利與三率 */}
              {finTab === 'profit' && (
                <div className="overflow-x-auto">
                  {quarterly.length > 0 ? (
                    <table className="w-full text-xs sm:text-sm text-left whitespace-nowrap">
                      <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 px-3 sm:px-4 py-2.5 rounded-l-lg">季度</th>
                          <th className="px-3 sm:px-4 py-2.5 text-purple-600 dark:text-purple-400 font-bold">單季營收</th>
                          <th className="px-3 sm:px-4 py-2.5">營收 YoY</th>
                          <th className="px-3 sm:px-4 py-2.5">EPS (元)</th>
                          <th className="px-3 sm:px-4 py-2.5">EPS YoY</th>
                          <th className="px-3 sm:px-4 py-2.5">毛利率</th>
                          <th className="px-3 sm:px-4 py-2.5">營益率</th>
                          <th className="px-3 sm:px-4 py-2.5 rounded-r-lg">淨利率</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {quarterly.slice().reverse().map((q) => (
                          <tr key={q.date} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group">
                            <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 px-3 sm:px-4 py-2.5 font-mono font-medium text-gray-900 dark:text-white">
                              {q.quarter}
                            </td>
                            <td className="px-3 sm:px-4 py-2.5 font-mono text-gray-900 dark:text-gray-100">
                              {formatMoney(q.revenue)}
                            </td>
                            <td className="px-3 sm:px-4 py-2.5 font-mono">{formatPctBadge(q.revenueYoyPct)}</td>
                            <td
                              className={`px-3 sm:px-4 py-2.5 font-mono font-bold ${
                                q.eps !== null && q.eps < 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}
                            >
                              {q.eps !== null ? q.eps.toFixed(2) : '-'}
                            </td>
                            <td className="px-3 sm:px-4 py-2.5 font-mono">{formatPctBadge(q.epsYoyPct)}</td>
                            <td className="px-3 sm:px-4 py-2.5 font-mono text-gray-700 dark:text-gray-300">
                              {q.grossMargin !== null ? `${q.grossMargin.toFixed(2)}%` : '-'}
                            </td>
                            <td className="px-3 sm:px-4 py-2.5 font-mono text-gray-700 dark:text-gray-300">
                              {q.operatingMargin !== null ? `${q.operatingMargin.toFixed(2)}%` : '-'}
                            </td>
                            <td className="px-3 sm:px-4 py-2.5 font-mono text-gray-700 dark:text-gray-300">
                              {q.netMargin !== null ? `${q.netMargin.toFixed(2)}%` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">暫無季度獲利資料</div>
                  )}
                </div>
              )}

              {/* Tab 3: 體質與現金流 */}
              {finTab === 'health' && (
                <div className="overflow-x-auto">
                  {quarterly.length > 0 ? (
                    <table className="w-full text-xs sm:text-sm text-left whitespace-nowrap">
                      <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 px-3 sm:px-4 py-2.5 rounded-l-lg">季度</th>
                          <th className="px-3 sm:px-4 py-2.5">年化 ROE</th>
                          <th className="px-3 sm:px-4 py-2.5">負債比率</th>
                          <th className="px-3 sm:px-4 py-2.5">本期淨利</th>
                          <th className="px-3 sm:px-4 py-2.5">營業現金流 (OCF)</th>
                          <th className="px-3 sm:px-4 py-2.5 rounded-r-lg">獲利含金量 (OCF/淨利)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {quarterly.slice().reverse().map((q) => (
                          <tr key={q.date} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group">
                            <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 px-3 sm:px-4 py-2.5 font-mono font-medium text-gray-900 dark:text-white">
                              {q.quarter}
                            </td>
                            <td className="px-3 sm:px-4 py-2.5 font-mono font-semibold text-gray-900 dark:text-gray-100">
                              {q.annualizedRoe !== null ? `${q.annualizedRoe.toFixed(2)}%` : '-'}
                            </td>
                            <td
                              className={`px-3 sm:px-4 py-2.5 font-mono ${
                                q.debtRatio !== null && q.debtRatio > 60
                                  ? 'text-red-500 font-bold'
                                  : 'text-gray-600 dark:text-gray-400'
                              }`}
                            >
                              {q.debtRatio !== null ? `${q.debtRatio.toFixed(2)}%` : '-'}
                            </td>
                            <td className="px-3 sm:px-4 py-2.5 font-mono text-gray-700 dark:text-gray-300">
                              {formatMoney(q.netIncome)}
                            </td>
                            <td
                              className={`px-3 sm:px-4 py-2.5 font-mono font-medium ${
                                q.ocf !== null && q.ocf < 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}
                            >
                              {formatMoney(q.ocf)}
                            </td>
                            <td
                              className={`px-3 sm:px-4 py-2.5 font-mono font-semibold ${
                                q.ocfToNetIncome !== null && q.ocfToNetIncome >= 100
                                  ? 'text-red-500'
                                  : q.ocfToNetIncome !== null && q.ocfToNetIncome < 50
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {q.ocfToNetIncome !== null ? `${q.ocfToNetIncome.toFixed(0)}%` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">暫無財務結構與現金流資料</div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </main>
    </div>
  );
};
