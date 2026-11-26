import React from 'react';
import { Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { StockTicker, InstCostRankingItem } from '../api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StockRowProps {
  symbol: string;
  ticker?: StockTicker;
  error?: string;
  loading?: boolean;
  onRemove?: (symbol: string) => void;
  readOnly?: boolean;
  rank?: number;
  instRanking?: InstCostRankingItem;
  activeInstPeriod?: '1d' | '6d' | '12d';
}

export const StockRow: React.FC<StockRowProps> = ({
  symbol,
  ticker,
  error,
  loading,
  onRemove,
  readOnly,
  rank,
  instRanking,
  activeInstPeriod = '1d',
}) => {
  if (loading && !ticker && !instRanking) {
    return (
      <div className="animate-pulse flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
        <div className="flex gap-4">
          <div className="w-12 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="w-24 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
        <div className="w-20 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/20 text-red-600 dark:text-red-400 text-sm">
        <span>{symbol}: {error}</span>
        {onRemove && !readOnly && (
          <button onClick={() => onRemove(symbol)} className="p-1 hover:bg-red-100 dark:bg-red-900/20 rounded">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    );
  }

  const displayName = ticker?.name || instRanking?.name || '';
  const displaySub = ticker?.exchange || ticker?.market || instRanking?.industry || '';
  const displayPrice =
    ticker?.lastClose !== undefined && ticker?.lastClose !== null && ticker.lastClose > 0
      ? ticker.lastClose
      : instRanking?.close;
  const hasChange =
    ticker?.lastChange !== undefined &&
    ticker?.lastChange !== null &&
    ticker?.lastChangePct !== undefined &&
    ticker?.lastChangePct !== null;
  const lastChange = hasChange ? ticker!.lastChange! : 0;
  const lastChangePct = hasChange ? ticker!.lastChangePct! : 0;
  const isUp = hasChange && lastChange > 0;
  const isDown = hasChange && lastChange < 0;

  const refCostPrice =
    activeInstPeriod === '12d' ? instRanking?.avgCost12d : instRanking?.avgCost6d;
  const costBiasPct =
    refCostPrice && refCostPrice > 0 && displayPrice
      ? ((displayPrice - refCostPrice) / refCostPrice) * 100
      : null;

  return (
    <div className="group flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3.5 sm:p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 transition-colors">
      <Link to={`/stock/${symbol}`} className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
        {rank !== undefined && (
          <span
            className={cn(
              'w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
              rank === 1 && 'bg-amber-400 text-amber-950 shadow-xs',
              rank === 2 && 'bg-gray-300 text-gray-800 dark:bg-gray-600 dark:text-gray-100',
              rank === 3 && 'bg-amber-700/80 text-white',
              rank > 3 && 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            )}
          >
            {rank}
          </span>
        )}

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="font-bold text-gray-900 dark:text-white shrink-0">{symbol}</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{displayName}</span>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{displaySub}</span>
        </div>
      </Link>

      {/* 外資 + 投信 1 / 6 / 12 日投入成本佔總市值比與推估成本價 */}
      {instRanking && (
        <div className="order-last sm:order-none w-full sm:w-auto flex flex-col items-start sm:items-end gap-1 text-xs pt-1 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-700/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'px-2 py-0.5 rounded-md font-medium border transition-colors',
                activeInstPeriod === '1d'
                  ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60 font-bold'
                  : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/50 dark:text-gray-400 dark:border-gray-700'
              )}
            >
              1日: {instRanking.ratio1d >= 0 ? '+' : ''}
              {instRanking.ratio1d.toFixed(2)}%
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-md font-medium border transition-colors',
                activeInstPeriod === '6d'
                  ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60 font-bold'
                  : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/50 dark:text-gray-400 dark:border-gray-700'
              )}
            >
              6日: {instRanking.ratio6d >= 0 ? '+' : ''}
              {instRanking.ratio6d.toFixed(2)}%
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-md font-medium border transition-colors',
                activeInstPeriod === '12d'
                  ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60 font-bold'
                  : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/50 dark:text-gray-400 dark:border-gray-700'
              )}
            >
              12日: {instRanking.ratio12d >= 0 ? '+' : ''}
              {instRanking.ratio12d.toFixed(2)}%
            </span>
          </div>

          {refCostPrice && refCostPrice > 0 ? (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              外投成本約 <strong className="text-gray-700 dark:text-gray-200">{refCostPrice.toFixed(2)}</strong> 元
              {costBiasPct !== null && (
                <span className={cn('ml-1 font-medium', costBiasPct >= 0 ? 'text-red-500' : 'text-emerald-500')}>
                  (距現價 {costBiasPct >= 0 ? '+' : ''}
                  {costBiasPct.toFixed(1)}%)
                </span>
              )}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2 sm:gap-5 shrink-0">
        <div className="flex flex-col items-end min-w-[76px] sm:min-w-[85px]">
          <span className={cn(
            "text-base sm:text-lg font-semibold",
            isUp && "text-red-600 dark:text-red-400",
            isDown && "text-green-600 dark:text-green-400",
            !isUp && !isDown && "text-gray-900 dark:text-white"
          )}>
            {displayPrice !== undefined ? displayPrice.toFixed(2) : '-'}
          </span>
          <div className={cn(
            "flex items-center text-[11px] sm:text-xs font-medium whitespace-nowrap",
            isUp && "text-red-600 dark:text-red-400",
            isDown && "text-green-600 dark:text-green-400",
            !isUp && !isDown && "text-gray-500 dark:text-gray-400"
          )}>
            {isUp && <TrendingUp size={12} className="mr-0.5 sm:mr-1 shrink-0" />}
            {isDown && <TrendingDown size={12} className="mr-0.5 sm:mr-1 shrink-0" />}
            <span>
              {hasChange ? (
                <>
                  {lastChange > 0 ? '+' : ''}{lastChange.toFixed(2)} ({lastChangePct.toFixed(2)}%)
                </>
              ) : '-'}
            </span>
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            {onRemove && (
              <button
                onClick={() => onRemove(symbol)}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all"
                title="刪除"
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
