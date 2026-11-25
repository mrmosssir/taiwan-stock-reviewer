import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  Flame,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { fetchIndustryStocks, type IndustryStockItem } from '../api';
import clsx from 'clsx';

const PAGE_SIZE = 30;

export const IndustryStocks = () => {
  const { industry: rawIndustry } = useParams<{ industry: string }>();
  const industry = rawIndustry ? decodeURIComponent(rawIndustry) : '';

  const [stocks, setStocks] = useState<IndustryStockItem[]>([]);
  const [lastDate, setLastDate] = useState<string>('');
  const [activeCount, setActiveCount] = useState<number>(0);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const rafLockRef = useRef<boolean>(false);

  const loadStocks = useCallback(async () => {
    if (!industry) return;
    setIsLoading(true);
    setError(null);
    setVisibleCount(PAGE_SIZE);
    try {
      const res = await fetchIndustryStocks(industry);
      setStocks(res.data);
      setLastDate(res.lastDate);
      setActiveCount(res.activeCount);
    } catch (e) {
      console.error('Failed to load industry stocks:', e);
      setError('載入分類個股失敗，請稍後重試');
    } finally {
      setIsLoading(false);
    }
  }, [industry]);

  useEffect(() => {
    loadStocks();
  }, [loadStocks]);

  const hasMore = visibleCount < stocks.length;

  // 下滑自動載入（本地分批渲染，完全不重複打 API，避免快速滑動觸發 Worker CPU limit 或卡死）
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || rafLockRef.current) return;
        rafLockRef.current = true;
        requestAnimationFrame(() => {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, stocks.length));
          rafLockRef.current = false;
        });
      },
      { rootMargin: '200px 0px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, stocks.length]);

  const visibleStocks = stocks.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200 pb-12">
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              to="/industries"
              className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors shrink-0"
              title="返回產業分類"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white truncate">
                {industry || '個股列表'}
              </h1>
              {!isLoading && !error && (
                <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>共 {stocks.length} 檔</span>
                  <span className="inline-flex items-center gap-0.5 text-orange-600 dark:text-orange-400 font-semibold">
                    <Flame size={11} className="fill-orange-500 text-orange-500" />
                    啟動 {activeCount} 檔
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadStocks}
              disabled={isLoading}
              title="重新整理"
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4">
        {/* 紅字警語：非即時報價 */}
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs sm:text-sm font-semibold">
          <AlertCircle size={16} className="shrink-0" />
          <span>
            此資料非即時報價，為最後一筆收盤紀錄
            {lastDate ? `（${lastDate}）` : ''}
          </span>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div key={idx} className="animate-pulse flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-5 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="w-20 h-5 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                  <div className="w-20 h-6 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-red-500 font-medium">{error}</p>
              <button
                onClick={loadStocks}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                重新載入
              </button>
            </div>
          ) : visibleStocks.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400 dark:text-gray-500">
              此分類目前尚無個股資料
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {visibleStocks.map((item) => {
                  const hasPrice = item.lastClose !== null && item.lastClose > 0;
                  const change = item.lastChange ?? 0;
                  const changePct = item.lastChangePct ?? 0;
                  const isUp = hasPrice && change > 0;
                  const isDown = hasPrice && change < 0;

                  return (
                    <Link
                      key={item.symbol}
                      to={`/stock/${item.symbol}`}
                      className={clsx(
                        'flex items-center justify-between gap-3 p-3.5 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors',
                        item.isActive && 'bg-orange-50/35 dark:bg-orange-950/15'
                      )}
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                          <span className="font-bold text-gray-900 dark:text-white shrink-0">
                            {item.symbol}
                          </span>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                            {item.name}
                          </span>
                          {item.isActive && (
                            <span
                              title={item.signalDate ? `波段啟動中（啟動日 ${item.signalDate}）` : '波段啟動中'}
                              className="inline-flex items-center shrink-0"
                            >
                              <Flame size={15} className="text-orange-500 fill-orange-500" />
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          {item.type === 'tpex' ? '上櫃' : item.type === 'twse' ? '上市' : item.type}
                          {item.isActive && item.signalDate ? ` · 啟動日 ${item.signalDate}` : ''}
                        </span>
                      </div>

                      <div className="flex flex-col items-end shrink-0 min-w-[82px]">
                        <span
                          className={clsx(
                            'text-base sm:text-lg font-semibold',
                            isUp && 'text-red-600 dark:text-red-400',
                            isDown && 'text-green-600 dark:text-green-400',
                            !isUp && !isDown && 'text-gray-900 dark:text-white'
                          )}
                        >
                          {hasPrice ? item.lastClose!.toFixed(2) : '-'}
                        </span>
                        <div
                          className={clsx(
                            'flex items-center text-[11px] sm:text-xs font-medium whitespace-nowrap',
                            isUp && 'text-red-600 dark:text-red-400',
                            isDown && 'text-green-600 dark:text-green-400',
                            !isUp && !isDown && 'text-gray-500 dark:text-gray-400'
                          )}
                        >
                          {isUp && <TrendingUp size={12} className="mr-0.5 shrink-0" />}
                          {isDown && <TrendingDown size={12} className="mr-0.5 shrink-0" />}
                          <span>
                            {hasPrice
                              ? `${change > 0 ? '+' : ''}${change.toFixed(2)} (${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%)`
                              : '-'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* 下滑自動載入哨兵 */}
              <div ref={sentinelRef} className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                {hasMore
                  ? `下滑載入更多（已顯示 ${visibleStocks.length} / ${stocks.length} 檔）...`
                  : `已顯示全部 ${stocks.length} 檔個股`}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
