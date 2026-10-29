import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AddStock } from '../components/AddStock';
import { StockRow } from '../components/StockRow';
import { Layout, LineChart, Github, FolderPlus, Edit2, Trash2, Sparkles, RefreshCw, BarChart3 } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { useWatchlist } from '../context/WatchlistContext';
import { fetchLatestPicks, fetchTickers, fetchQuotes } from '../api';
import type { StockTicker, StockQuote } from '../api';
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
  const currentFolder = folders.find(f => f.id === activeFolderId);
  
  // 決定要渲染的股票列表
  const currentStocks = isDailyPicks 
    ? dailyPicks 
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
    } catch (e) {
      console.error('Batch fetch error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // 初次載入或列表改變時
    loadBatchData(currentStocks);

    // 30 秒輪詢
    const interval = setInterval(() => {
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h2 className="text-2xl font-bold mb-2">我的台股觀察名單</h2>
          <p className="text-gray-500 dark:text-gray-400">串接即時行情 API，追蹤自選股動態</p>
        </header>

        {/* 資料夾分頁區 */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setActiveFolderId('daily_picks')}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors",
              isDailyPicks
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
            )}
          >
            <Sparkles size={16} />
            每日推薦
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
          
          {folders.map(folder => (
            <div key={folder.id} className="relative group flex items-center">
              <button
                onClick={() => setActiveFolderId(folder.id)}
                className={clsx(
                  "px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors border",
                  activeFolderId === folder.id
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
                )}
              >
                {folder.name}
              </button>
              
              {activeFolderId === folder.id && (
                <div className="absolute right-0 flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-blue-50 via-blue-50 to-transparent dark:from-blue-900/30 dark:via-blue-900/30 pl-4 py-1 rounded-r-lg">
                  <button onClick={() => handleRename(folder.id, folder.name)} className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300" title="重新命名">
                    <Edit2 size={14} />
                  </button>
                  {folders.length > 1 && (
                    <button onClick={() => handleDelete(folder.id)} className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" title="刪除">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          
          <button
            onClick={handleCreateFolder}
            className="flex items-center gap-1 px-3 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition-colors ml-2"
          >
            <FolderPlus size={16} />
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex gap-4 items-center">
            <div className="flex-1">
              <AddStock disabled={false} />
            </div>
            <button
              onClick={() => loadBatchData(currentStocks)}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm flex items-center gap-2 text-gray-600 dark:text-gray-300 disabled:opacity-50"
              title="重新整理報價"
              disabled={isRefreshing || currentStocks.length === 0}
            >
              <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
              <span className="hidden sm:inline">更新</span>
            </button>
          </div>

          <div className="flex flex-col">
            {isLoadingPicks && isDailyPicks ? (
              <div className="p-12 text-center text-gray-400 dark:text-gray-500">
                <span className="inline-block w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4"></span>
                <p>載入推薦名單中...</p>
              </div>
            ) : currentStocks.length > 0 ? (
              currentStocks.map(symbol => (
                <StockRow
                  key={`${activeFolderId}-${symbol}`}
                  symbol={symbol}
                  ticker={tickersMap[symbol]}
                  quote={quotesMap[symbol]}
                  loading={!tickersMap[symbol] && !quotesMap[symbol]}
                  onRemove={isDailyPicks ? undefined : (s) => removeStockFromFolder(activeFolderId, s)}
                  readOnly={isDailyPicks}
                />
              ))
            ) : (
              <div className="p-12 text-center text-gray-400 dark:text-gray-500">
                <Layout size={48} className="mx-auto mb-4 opacity-20" />
                <p>{isDailyPicks ? "目前沒有每日推薦資料" : "目前還沒有自選股，請從上方搜尋並加入。"}</p>
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
