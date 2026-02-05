import React, { useState } from 'react';
import { Plus, Search } from 'lucide-react';

interface AddStockProps {
  onAdd: (symbol: string) => void;
  disabled: boolean;
}

export const AddStock: React.FC<AddStockProps> = ({ onAdd, disabled }) => {
  const [symbol, setSymbol] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      onAdd(symbol.trim().toUpperCase());
      setSymbol('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="輸入股票代號 (例如: 2330)"
          disabled={disabled}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !symbol.trim()}
        className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:bg-gray-300"
      >
        <Plus size={18} />
        新增自選
      </button>
    </form>
  );
};
