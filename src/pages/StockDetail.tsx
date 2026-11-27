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
import { ArrowLeft, Users, CreditCard, PieChart, TrendingUp, BarChart3, Activity, Wallet, Star, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
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

  const [finTab, setFinTab] = useState<'profit' | 'revenue' | 'strength' | 'cash'>('profit');

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
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 sm:mb-6 gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 font-bold border-l-4 border-purple-500 pl-3">
              <PieChart size={20} className="text-purple-500" />
              <h3>財務報表分析</h3>
            </div>
            <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg self-start max-w-full overflow-x-auto scrollbar-hide whitespace-nowrap">
              <button onClick={() => setFinTab('profit')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 shrink-0 ${finTab === 'profit' ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><TrendingUp size={14} /> 獲利能力</button>
              <button onClick={() => setFinTab('revenue')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 shrink-0 ${finTab === 'revenue' ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><BarChart3 size={14} /> 營收表現</button>
              <button onClick={() => setFinTab('strength')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 shrink-0 ${finTab === 'strength' ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><Activity size={14} /> 財務結構</button>
              <button onClick={() => setFinTab('cash')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 shrink-0 ${finTab === 'cash' ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><Wallet size={14} /> 現金流量</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {financials.eps.length > 0 ? (
              <table className="w-full text-xs sm:text-sm text-left whitespace-nowrap">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 px-3 sm:px-4 py-2.5 sm:py-3 rounded-l-lg">季度</th>
                    {finTab === 'profit' && (
                      <>
                        <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-purple-600 dark:text-purple-400 font-bold">本期淨利 (百萬)</th>
                        <th className="px-3 sm:px-4 py-2.5 sm:py-3">EPS (元)</th>
                        <th className="px-3 sm:px-4 py-2.5 sm:py-3">毛利率 (%)</th>
                        <th className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-r-lg">營業利益率 (%)</th>
                      </>
                    )}
                    {finTab === 'revenue' && <th className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-r-lg">營業收入 (百萬)</th>}
                    {finTab === 'strength' && (
                      <>
                        <th className="px-3 sm:px-4 py-2.5 sm:py-3">負債比率 (%)</th>
                        <th className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-r-lg">ROE (%)</th>
                      </>
                    )}
                    {finTab === 'cash' && <th className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-r-lg">營業現金流 (百萬)</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {financials.eps.slice().reverse().map((item) => {
                    const date = item.date;
                    const gm = financials.grossMargin.find(d => d.date === date)?.value;
                    const om = financials.operatingMargin.find(d => d.date === date)?.value;
                    const rev = financials.revenue.find(d => d.date === date)?.value;
                    const debt = financials.debtRatio.find(d => d.date === date)?.value;
                    const roe = financials.roe.find(d => d.date === date)?.value;
                    const ocf = financials.ocf.find(d => d.date === date)?.value;
                    const ni = financials.netIncome.find(d => d.date === date)?.value;

                    return (
                      <tr key={date} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 group">
                        <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/50 px-3 sm:px-4 py-2.5 sm:py-3 font-medium text-gray-900 dark:text-white">{date}</td>
                        {finTab === 'profit' && (
                          <>
                            <td className="px-3 sm:px-4 py-2.5 sm:py-3 font-mono text-purple-700 dark:text-purple-400">
                              {ni ? (ni / 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                            </td>
                            <td className={`px-3 sm:px-4 py-2.5 sm:py-3 font-bold ${item.value >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-green-600 dark:text-green-400'}`}>{item.value.toFixed(2)}</td>
                            <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-gray-600 dark:text-gray-400">{gm ? gm.toFixed(2) : '-'}%</td>
                            <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-gray-600 dark:text-gray-400">{om ? om.toFixed(2) : '-'}%</td>
                          </>
                        )}
                        {finTab === 'revenue' && (
                          <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 dark:text-gray-100 font-mono">
                            {rev ? (rev / 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                          </td>
                        )}
                        {finTab === 'strength' && (
                          <>
                            <td className={`px-3 sm:px-4 py-2.5 sm:py-3 ${debt && debt > 60 ? 'text-red-500 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>{debt ? debt.toFixed(2) : '-'}%</td>
                            <td className="px-3 sm:px-4 py-2.5 sm:py-3 text-gray-600 dark:text-gray-400">{roe ? roe.toFixed(2) : '-'}%</td>
                          </>
                        )}
                        {finTab === 'cash' && (
                          <td className={`px-3 sm:px-4 py-2.5 sm:py-3 font-mono ${ocf && ocf < 0 ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                            {ocf ? (ocf / 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">暫無詳細財報數據</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
