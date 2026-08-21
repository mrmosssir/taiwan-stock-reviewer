import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchTicker } from '../api';

interface AddStockProps {
  onAdd?: (symbol: string) => void;
  disabled?: boolean;
}

export const AddStock: React.FC<AddStockProps> = ({ disabled }) => {
  const [symbol, setSymbol] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSymbol = symbol.trim().toUpperCase();
    if (!targetSymbol) return;

    // 前端格式驗證：檢查是否為 4 個數字
    if (!/^\d{4}$/.test(targetSymbol)) {
      alert('請輸入有效的 4 位數股票代號（例如：2330）');
      return;
    }

    setIsLoading(true);
    try {
      const ticker = await fetchTicker(targetSymbol);
      if (ticker && ticker.name) {
        // 存在該股票，跳轉到個股頁面
        navigate(`/stock/${targetSymbol}`);
      } else {
        alert(`找不到股票代號 ${targetSymbol} 的資料`);
      }
    } catch (error) {
      console.error('Error searching stock:', error);
      alert('搜尋發生錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="輸入 4 位數股票代號 (例如: 2330)"
          disabled={disabled || isLoading}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:cursor-not-allowed transition-all"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !symbol.trim() || isLoading}
        className="flex items-center justify-center min-w-[100px] gap-2 px-6 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-black dark:hover:bg-gray-600 transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
      >
        {isLoading ? (
          <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
        ) : (
          <>
            <Search size={18} />
            搜尋
          </>
        )}
      </button>
    </form>
  );
};
