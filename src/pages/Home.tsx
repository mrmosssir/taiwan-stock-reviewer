import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AddStock } from '../components/AddStock';
import { StockRow } from '../components/StockRow';
import {
  Layout,
  LineChart,
  Github,
  FolderPlus,
  Edit2,
  Trash2,
  Sparkles,
  RefreshCw,
  BarChart3,
  Trophy,
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useWatchlist } from '../context/WatchlistContext';
import { fetchLatestPicks, fetchInstRankings, fetchTickers, fetchQuotes } from '../api';
import type { StockTicker, StockQuote, InstRankingsResponse, InstCostRankingItem } from '../api';
import {
  getTaiwanMarketSession,
  verifyQuoteIsTodayOrLockHoliday,
} from '../utils/tradingHours';
import clsx from 'clsx';

export const Home = () => {
  const {
    folders,
    activeFolderId,
    setActiveFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
    removeStockFromFolder
  } = useWatchlist();

  const [dailyPicks, setDailyPicks] = useState<string[]>([]);
  const [isLoadingPicks, setIsLoadingPicks] = useState(false);
  const fetchedRef = useRef(false);

  const [instRankings, setInstRankings] = useState<InstRankingsResponse>({
    date: '',
    top1d: [],
    top6d: [],
    top12d: [],
  });
  const [instPeriod, setInstPeriod] = useState<'1d' | '6d' | '12d'>('1d');
  const [isLoadingInst, setIsLoadingInst] = useState(false);
  const fetchedInstRef = useRef(false);

  const [tickersMap, setTickersMap] = useState<Record<string, StockTicker>>({});
  const [quotesMap, setQuotesMap] = useState<Record<string, StockQuote>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 當切換到每日推薦時，去抓 API
  useEffect(() => {
    if (activeFolderId === 'daily_picks' && dailyPicks.length === 0 && !fetchedRef.current) {
      fetchedRef.current = true;
      setIsLoadingPicks(true);
      fetchLatestPicks().then(picks => {
        setDailyPicks(picks.map(p => p.symbol));
        setIsLoadingPicks(false);
      });
    }
  }, [activeFolderId, dailyPicks.length]);

  // 當切換到外投成本排行時，去抓 API
  useEffect(() => {
    if (activeFolderId === 'inst_rankings' && !fetchedInstRef.current) {
      fetchedInstRef.current = true;
      setIsLoadingInst(true);
      fetchInstRankings().then(res => {
        setInstRankings(res);
        setIsLoadingInst(false);
      });
    }
  }, [activeFolderId]);

  const handleCreateFolder = () => {
    const name = window.prompt('請輸入新資料夾名稱：');
    if (name && name.trim()) {
      createFolder(name.trim());
    }
  };

  const handleRename = (id: string, currentName: string) => {
    const newName = window.prompt('請輸入新的資料夾名稱：', currentName);
    if (newName && newName.trim()) {
      renameFolder(id, newName.trim());
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm('確定要刪除這個資料夾嗎？')) {
      deleteFolder(id);
    }
  };

  const isDailyPicks = activeFolderId === 'daily_picks';
  const isInstRankings = activeFolderId === 'inst_rankings';
  const currentFolder = folders.find(f => f.id === activeFolderId);

  const activeInstList: InstCostRankingItem[] =
    instPeriod === '1d'
      ? instRankings.top1d
      : instPeriod === '6d'
      ? instRankings.top6d
      : instRankings.top12d;

  const instRankingMap: Record<string, InstCostRankingItem> = {};
  for (const item of activeInstList) {
    instRankingMap[item.symbol] = item;
  }

  // 決定要渲染的股票列表
  const currentStocks = isDailyPicks
    ? dailyPicks
    : isInstRankings
    ? activeInstList.map(i => i.symbol)
    : (currentFolder?.stocks || []);

  const loadBatchData = async (symbols: string[]) => {
    if (symbols.length === 0) return;
    setIsRefreshing(true);
    try {
      const [newTickers, newQuotes] = await Promise.all([
        fetchTickers(symbols),
        fetchQuotes(symbols)
      ]);
      setTickersMap(prev => ({ ...prev, ...newTickers }));
      setQuotesMap(prev => ({ ...prev, ...newQuotes }));
      const firstQuote = Object.values(newQuotes)[0];
      if (firstQuote) {
        verifyQuoteIsTodayOrLockHoliday(firstQuote.lastUpdated);
      }
    } catch (e) {
      console.error('Batch fetch error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadBatchData(currentStocks);

    // 僅於開盤日盤中 (09:00 ~ 13:35) 才每 30 秒自動輪詢；收盤後、16:00後、週末與國定假日停止背景輪詢
    const interval = setInterval(() => {
      const sessionInfo = getTaiwanMarketSession();
      if (!sessionInfo.shouldPollRealtime) return;
      loadBatchData(currentStocks);
    }, 30000);

    return () => clearInterval(interval);
  }, [currentStocks.join(',')]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200">
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <LineChart size={28} strokeWidth={2.5} />
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">StockReview</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/market"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-xs font-semibold transition-colors border border-blue-200/50 dark:border-blue-800/50"
            >
              <BarChart3 size={15} />
              <span>大盤總覽</span>
            </Link>
            <ThemeToggle />
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <Github size={20} />
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-5 sm:py-8">
        <header className="mb-5 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">我的台股觀察名單</h2>
          <p className="text-xs sm:text-base text-gray-500 dark:text-gray-400">串接即時行情 API，追蹤自選股與全市場法人重倉動態</p>
        </header>

        {/* 資料夾分頁區 */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setActiveFolderId('daily_picks')}
            className={clsx(
              "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
              isDailyPicks
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
            )}
          >
            <Sparkles size={16} />
            每日推薦
          </button>

          <button
            onClick={() => setActiveFolderId('inst_rankings')}
            className={clsx(
              "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors",
              isInstRankings
                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
            )}
          >
            <Trophy size={16} />
            外投成本排行 (Top 10)
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1 shrink-0"></div>
          
          {folders.map(folder => {
            const isActive = activeFolderId === folder.id;
            return (
              <div
                key={folder.id}
                className={clsx(
                  "group flex items-center rounded-lg border shrink-0 transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
                )}
              >
                <button
                  onClick={() => setActiveFolderId(folder.id)}
                  className="px-3 sm:px-4 py-2 text-sm font-medium whitespace-nowrap"
                >
                  {folder.name}
                </button>
                
                {isActive && (
                  <div className="flex items-center gap-0.5 pr-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleRename(folder.id, folder.name)} className="p-1.5 sm:p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300" title="重新命名">
                      <Edit2 size={14} />
                    </button>
                    {folders.length > 1 && (
                      <button onClick={() => handleDelete(folder.id)} className="p-1.5 sm:p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" title="刪除">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          
          <button
            onClick={handleCreateFolder}
            className="flex items-center gap-1 px-3 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition-colors ml-1 shrink-0"
          >
            <FolderPlus size={16} />
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          {isInstRankings ? (
            <div className="p-3.5 sm:p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 dark:text-white text-sm">
                    🏦 全市場 1,800 檔「外資＋投信」投入成本佔總市值比 Top 10
                  </span>
                  {instRankings.date && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      (資料日期：{instRankings.date})
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  公式：期間外資與投信累積投入成本總金額 (買賣超股數 × 當日均價) ÷ 該檔股票總市值，由高往低取前 10 名
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-200/70 dark:bg-gray-700 p-1 rounded-lg text-xs font-semibold">
                  {(['1d', '6d', '12d'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setInstPeriod(p)}
                      className={clsx(
                        'px-3 py-1.5 rounded-md transition-all',
                        instPeriod === p
                          ? 'bg-white dark:bg-gray-600 text-rose-600 dark:text-rose-400 shadow-xs'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      )}
                    >
                      {p === '1d' ? '1日佔比 Top 10' : p === '6d' ? '6日佔比 Top 10' : '12日佔比 Top 10'}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setIsLoadingInst(true);
                    fetchInstRankings().then(res => {
                      setInstRankings(res);
                      setIsLoadingInst(false);
                    });
                    loadBatchData(currentStocks);
                  }}
                  className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-xs text-gray-600 dark:text-gray-300 disabled:opacity-50"
                  title="重新整理排行與報價"
                  disabled={isLoadingInst || isRefreshing}
                >
                  <RefreshCw size={16} className={isLoadingInst || isRefreshing ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3.5 sm:p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex gap-2.5 sm:gap-4 items-center">
              <div className="flex-1 min-w-0">
                <AddStock disabled={false} />
              </div>
              <button
                onClick={() => loadBatchData(currentStocks)}
                className="px-3 sm:px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm flex items-center gap-2 text-gray-600 dark:text-gray-300 disabled:opacity-50 shrink-0"
                title="重新整理報價"
                disabled={isRefreshing || currentStocks.length === 0}
              >
                <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
                <span className="hidden sm:inline">更新</span>
              </button>
            </div>
          )}

          <div className="flex flex-col">
            {(isLoadingPicks && isDailyPicks) || (isLoadingInst && isInstRankings) ? (
              <div className="p-12 text-center text-gray-400 dark:text-gray-500">
                <span className="inline-block w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4"></span>
                <p>{isInstRankings ? '計算全市場外投成本佔市值 Top 10 中...' : '載入推薦名單中...'}</p>
              </div>
            ) : currentStocks.length > 0 ? (
              currentStocks.map((symbol, idx) => (
                <StockRow
                  key={`${activeFolderId}-${instPeriod}-${symbol}`}
                  symbol={symbol}
                  ticker={tickersMap[symbol]}
                  quote={quotesMap[symbol]}
                  loading={!tickersMap[symbol] && !quotesMap[symbol] && !instRankingMap[symbol]}
                  onRemove={isDailyPicks || isInstRankings ? undefined : (s) => removeStockFromFolder(activeFolderId, s)}
                  readOnly={isDailyPicks || isInstRankings}
                  rank={isInstRankings ? idx + 1 : undefined}
                  instRanking={isInstRankings ? instRankingMap[symbol] : undefined}
                  activeInstPeriod={isInstRankings ? instPeriod : undefined}
                />
              ))
            ) : (
              <div className="p-12 text-center text-gray-400 dark:text-gray-500">
                <Layout size={48} className="mx-auto mb-4 opacity-20" />
                <p>
                  {isDailyPicks
                    ? "目前沒有每日推薦資料"
                    : isInstRankings
                    ? "目前尚無外投成本排行資料"
                    : "目前還沒有自選股，請從上方搜尋並加入。"}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
        <p>© 2026 StockReview Project • 資料來源：台灣證券交易所 / Cloud Stock Chooser</p>
      </footer>
    </div>
  );
};
