import React, { useEffect, useState } from 'react';
import { Trash2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchQuote, fetchTicker } from '../api';
import type { StockQuote, StockTicker } from '../api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StockRowProps {
  symbol: string;
  apiKey: string;
  onRemove: (symbol: string) => void;
}

export const StockRow: React.FC<StockRowProps> = ({ symbol, apiKey, onRemove }) => {
  const [ticker, setTicker] = useState<StockTicker | null>(null);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const tickerData = await fetchTicker(symbol, apiKey);
      const quoteData = await fetchQuote(symbol, apiKey);
      setTicker(tickerData);
      setQuote(quoteData);
    } catch (err: any) {
      setError(err.response?.data?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [symbol, apiKey]);

  if (loading && !ticker) {
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
        <button onClick={() => onRemove(symbol)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded">
          <Trash2 size={16} />
        </button>
      </div>
    );
  }

  const isUp = quote && quote.change > 0;
  const isDown = quote && quote.change < 0;

  return (
    <div className="group flex items-center justify-between p-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 transition-colors">
      <Link to={`/stock/${symbol}`} className="flex flex-col flex-1 hover:opacity-80 transition-opacity">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900 dark:text-white">{symbol}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{ticker?.name}</span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">{ticker?.market}</span>
      </Link>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className={cn(
            "text-lg font-semibold",
            isUp && "text-red-600 dark:text-red-400",
            isDown && "text-green-600 dark:text-green-400",
            !isUp && !isDown && "text-gray-900 dark:text-white"
          )}>
            {quote?.lastPrice.toFixed(2)}
          </span>
          <div className={cn(
            "flex items-center text-xs font-medium",
            isUp && "text-red-600 dark:text-red-400",
            isDown && "text-green-600 dark:text-green-400",
            !isUp && !isDown && "text-gray-500 dark:text-gray-400"
          )}>
            {isUp && <TrendingUp size={12} className="mr-1" />}
            {isDown && <TrendingDown size={12} className="mr-1" />}
            <span>
              {quote && (
                <>
                  {quote.change > 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={loadData}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all"
            title="更新"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => onRemove(symbol)}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all"
            title="刪除"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
