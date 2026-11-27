import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Flame,
  LayoutGrid,
  RefreshCw,
  Search,
  Snowflake,
  Sparkles,
  Sun,
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  fetchIndustries,
  fetchConcepts,
  type IndustryCategoryItem,
  type ConceptCategoryItem,
} from '../api';
import clsx from 'clsx';

type TabKey = 'industries' | 'concepts';
type SortKey = 'active' | 'flow' | 'change';
type ConceptKindFilter = 'all' | 'theme' | 'chain';

export const Industries = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: TabKey = searchParams.get('tab') === 'concepts' ? 'concepts' : 'industries';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [industries, setIndustries] = useState<IndustryCategoryItem[]>([]);
  const [concepts, setConcepts] = useState<ConceptCategoryItem[]>([]);
  const [industryDate, setIndustryDate] = useState<string>('');
  const [conceptDate, setConceptDate] = useState<string>('');
  const [isLoadingIndustries, setIsLoadingIndustries] = useState<boolean>(true);
  const [isLoadingConcepts, setIsLoadingConcepts] = useState<boolean>(false);
  const [conceptsLoaded, setConceptsLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('active');
  const [conceptKind, setConceptKind] = useState<ConceptKindFilter>('all');
  const [keyword, setKeyword] = useState<string>('');

  const loadIndustries = useCallback(async () => {
    setIsLoadingIndustries(true);
    setError(null);
    try {
      const res = await fetchIndustries();
      setIndustries(res.industries);
      setIndustryDate(res.date);
    } catch (e: any) {
      console.error('Failed to load industries:', e);
      setError('無法載入產業分類資料，請稍後重試');
    } finally {
      setIsLoadingIndustries(false);
    }
  }, []);

  const loadConcepts = useCallback(async () => {
    setIsLoadingConcepts(true);
    setError(null);
    try {
      const res = await fetchConcepts();
      setConcepts(res.concepts);
      setConceptDate(res.date);
      setConceptsLoaded(true);
    } catch (e: any) {
      console.error('Failed to load concepts:', e);
      setError('無法載入概念題材資料，請稍後重試');
    } finally {
      setIsLoadingConcepts(false);
    }
  }, []);

  useEffect(() => {
    loadIndustries();
  }, [loadIndustries]);

  useEffect(() => {
    if (activeTab === 'concepts' && !conceptsLoaded) {
      loadConcepts();
    }
  }, [activeTab, conceptsLoaded, loadConcepts]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setKeyword('');
    setError(null);
    if (tab === 'concepts' && sortBy === 'flow') {
      setSortBy('active');
    }
    setSearchParams(tab === 'concepts' ? { tab: 'concepts' } : {}, { replace: true });
  };

  const handleRefresh = () => {
    if (activeTab === 'concepts') {
      loadConcepts();
    } else {
      loadIndustries();
    }
  };

  const isLoading = activeTab === 'concepts' ? isLoadingConcepts : isLoadingIndustries;
  const dataDate = activeTab === 'concepts' ? conceptDate : industryDate;

  const totalActiveCount = useMemo(
    () => industries.reduce((sum, item) => sum + item.activeCount, 0),
    [industries]
  );

  const conceptKindCounts = useMemo(() => {
    let theme = 0;
    let chain = 0;
    for (const c of concepts) {
      if (c.kind === 'chain') chain++;
      else theme++;
    }
    return { all: concepts.length, theme, chain };
  }, [concepts]);

  const displayedIndustries = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const filtered = q
      ? industries.filter((i) => i.industry.toLowerCase().includes(q))
      : industries;

    return [...filtered].sort((a, b) => {
      if (sortBy === 'flow') {
        return b.flowScore - a.flowScore || b.activeCount - a.activeCount;
      }
      if (sortBy === 'change') {
        return b.avgChangePct - a.avgChangePct || b.activeCount - a.activeCount;
      }
      return (
        b.activeCount - a.activeCount ||
        b.flowScore - a.flowScore ||
        a.industry.localeCompare(b.industry)
      );
    });
  }, [industries, keyword, sortBy]);

  const displayedConcepts = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const filtered = concepts.filter((c) => {
      if (conceptKind !== 'all' && c.kind !== conceptKind) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'change') {
        return b.avgChangePct - a.avgChangePct || b.activeCount - a.activeCount;
      }
      return (
        b.activeCount - a.activeCount ||
        b.avgChangePct - a.avgChangePct ||
        a.name.localeCompare(b.name)
      );
    });
  }, [concepts, conceptKind, keyword, sortBy]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans transition-colors duration-200 pb-12">
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              to="/"
              className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors shrink-0"
              title="返回首頁"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-2 text-indigo-600 dark:text-indigo-400 min-w-0">
              <LayoutGrid size={20} strokeWidth={2.5} className="shrink-0" />
              <h1 className="text-base sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white truncate">
                分類選股
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              title="重新整理"
              className="p-2 sm:px-3 sm:py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">重新整理</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        {/* 主分頁切換：官方產業 vs 概念題材 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleTabChange('industries')}
            className={clsx(
              'flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer border',
              activeTab === 'industries'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
          >
            <LayoutGrid size={15} />
            <span>官方產業</span>
          </button>
          <button
            onClick={() => handleTabChange('concepts')}
            className={clsx(
              'flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer border',
              activeTab === 'concepts'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
          >
            <Sparkles size={15} />
            <span>概念題材</span>
          </button>
        </div>

        {/* 圖例說明與統計摘要 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3.5 sm:p-4 border border-gray-200 dark:border-gray-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {activeTab === 'industries' ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-600 dark:text-gray-300">
              <span className="inline-flex items-center gap-1 font-medium">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-500">
                  <Sun size={13} />
                </span>
                強勢資金湧入
              </span>
              <span className="inline-flex items-center gap-1 font-medium">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-500">
                  <Snowflake size={13} />
                </span>
                弱勢資金流出
              </span>
              <span className="inline-flex items-center gap-1 font-medium">
                <Flame size={14} className="text-orange-500 fill-orange-500" />
                全市場啟動中：<strong className="text-orange-600 dark:text-orange-400">{totalActiveCount}</strong> 檔
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {[
                { id: 'all' as const, label: `全部 (${conceptKindCounts.all})` },
                { id: 'theme' as const, label: `熱門概念 (${conceptKindCounts.theme})` },
                { id: 'chain' as const, label: `產業鏈 (${conceptKindCounts.chain})` },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setConceptKind(opt.id)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer border',
                    conceptKind === opt.id
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60'
                      : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:border-gray-700 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {dataDate && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
              收盤資料日期：{dataDate}
            </span>
          )}
        </div>

        {/* 搜尋與排序工具列 */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={activeTab === 'concepts' ? '搜尋概念股或產業鏈...' : '搜尋產業分類...'}
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </div>

          <div className="flex items-center gap-1 bg-gray-200/70 dark:bg-gray-800 p-1 rounded-xl border border-gray-200/80 dark:border-gray-700 text-xs font-semibold self-start sm:self-auto">
            {(activeTab === 'industries'
              ? [
                  { id: 'active' as const, label: '啟動股數' },
                  { id: 'flow' as const, label: '資金強弱' },
                  { id: 'change' as const, label: '平均漲跌' },
                ]
              : [
                  { id: 'active' as const, label: '啟動股數' },
                  { id: 'change' as const, label: '平均漲跌' },
                ]
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSortBy(opt.id)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg transition-all cursor-pointer',
                  sortBy === opt.id
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 分類按鈕網格 */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 animate-pulse p-4"
              />
            ))}
          </div>
        ) : error ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center border border-red-200 dark:border-red-900/50 space-y-3">
            <p className="text-sm text-red-500 font-medium">{error}</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              重新載入
            </button>
          </div>
        ) : activeTab === 'industries' ? (
          displayedIndustries.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center text-sm text-gray-400 border border-gray-200 dark:border-gray-700">
              找不到符合「{keyword}」的產業分類
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {displayedIndustries.map((item) => {
                const isSun = item.flowStatus === 'sun';
                const isSnow = item.flowStatus === 'snow';
                const isUp = item.avgChangePct > 0;
                const isDown = item.avgChangePct < 0;

                return (
                  <button
                    key={item.industry}
                    onClick={() => navigate(`/industries/${encodeURIComponent(item.industry)}`)}
                    className={clsx(
                      'relative text-left rounded-2xl p-3.5 sm:p-4 bg-white dark:bg-gray-800 border transition-all cursor-pointer active:scale-[0.98] hover:shadow-md flex flex-col justify-between min-h-[108px] sm:min-h-[116px]',
                      isSun
                        ? 'border-amber-300/80 dark:border-amber-700/60 hover:border-amber-400'
                        : isSnow
                        ? 'border-sky-300/80 dark:border-sky-700/60 hover:border-sky-400'
                        : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                    )}
                  >
                    {/* 右上角：強勢資金太陽 / 弱勢資金雪花 */}
                    {isSun && (
                      <span
                        title="強勢資金湧入"
                        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-500 flex items-center justify-center shadow-xs"
                      >
                        <Sun size={16} strokeWidth={2.4} />
                      </span>
                    )}
                    {isSnow && (
                      <span
                        title="弱勢資金流出"
                        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-500 flex items-center justify-center shadow-xs"
                      >
                        <Snowflake size={16} strokeWidth={2.4} />
                      </span>
                    )}

                    <div className={clsx('pr-8', !isSun && !isSnow && 'pr-0')}>
                      <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-snug line-clamp-2">
                        {item.industry}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                        <span>共 {item.totalCount} 檔</span>
                        {item.avgChangePct !== 0 && (
                          <span
                            className={clsx(
                              'font-semibold',
                              isUp && 'text-red-500',
                              isDown && 'text-emerald-500'
                            )}
                          >
                            {isUp ? '+' : ''}
                            {item.avgChangePct.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 啟動股數徽章 */}
                    <div className="mt-3 flex items-center">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                          item.activeCount > 0
                            ? 'bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800/60'
                            : 'bg-gray-100 text-gray-400 dark:bg-gray-700/60 dark:text-gray-500'
                        )}
                      >
                        <Flame
                          size={12}
                          className={item.activeCount > 0 ? 'text-orange-500 fill-orange-500' : 'text-gray-400'}
                        />
                        啟動 {item.activeCount} 檔
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : displayedConcepts.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center text-sm text-gray-400 border border-gray-200 dark:border-gray-700">
            {concepts.length === 0
              ? '尚無概念題材資料（請確認後端已完成概念股同步）'
              : `找不到符合「${keyword}」的概念題材`}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {displayedConcepts.map((item) => {
              const isUp = item.avgChangePct > 0;
              const isDown = item.avgChangePct < 0;

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(`/concepts/${encodeURIComponent(item.id)}`)}
                  className="relative text-left rounded-2xl p-3.5 sm:p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all cursor-pointer active:scale-[0.98] hover:shadow-md flex flex-col justify-between min-h-[112px] sm:min-h-[120px]"
                >
                  <div>
                    <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-white leading-snug line-clamp-2">
                      {item.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                      <span>共 {item.totalCount} 檔</span>
                      {item.avgChangePct !== 0 && (
                        <span
                          className={clsx(
                            'font-semibold',
                            isUp && 'text-red-500',
                            isDown && 'text-emerald-500'
                          )}
                        >
                          {isUp ? '+' : ''}
                          {item.avgChangePct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 底部：啟動股數徽章 + 概念/產業鏈標籤 */}
                  <div className="mt-3 flex items-center justify-between gap-1.5">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap',
                        item.activeCount > 0
                          ? 'bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800/60'
                          : 'bg-gray-100 text-gray-400 dark:bg-gray-700/60 dark:text-gray-500'
                      )}
                    >
                      <Flame
                        size={12}
                        className={item.activeCount > 0 ? 'text-orange-500 fill-orange-500' : 'text-gray-400'}
                      />
                      啟動 {item.activeCount} 檔
                    </span>
                    <span
                      className={clsx(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0',
                        item.kind === 'theme'
                          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300'
                      )}
                    >
                      {item.kind === 'theme' ? '概念' : '產業鏈'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
