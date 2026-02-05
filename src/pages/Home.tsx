import { useState, useEffect } from 'react';
import { Settings } from '../components/Settings';
import { AddStock } from '../components/AddStock';
import { StockRow } from '../components/StockRow';
import { Layout, LineChart, Github } from 'lucide-react';

export const Home = () => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('fugle_api_key') || '');
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const saved = localStorage.getItem('stock_watchlist');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('fugle_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('stock_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  const addStock = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setWatchlist([symbol, ...watchlist]);
    }
  };

  const removeStock = (symbol: string) => {
    setWatchlist(watchlist.filter(s => s !== symbol));
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-600">
            <LineChart size={28} strokeWidth={2.5} />
            <h1 className="text-xl font-bold tracking-tight text-gray-900">StockReview</h1>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Github size={20} />
          </a>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h2 className="text-2xl font-bold mb-2">我的台股觀察名單</h2>
          <p className="text-gray-500">串接 Fugle 市場行情 API，即時追蹤自選股動態</p>
        </header>

        <Settings apiKey={apiKey} onSave={setApiKey} />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <AddStock onAdd={addStock} disabled={!apiKey} />
            {!apiKey && (
              <div className="text-amber-600 text-sm bg-amber-50 p-3 rounded-lg border border-amber-100">
                請先於上方設定您的 Fugle API Key 以開始查詢行情。
              </div>
            )}
          </div>

          <div className="flex flex-col">
            {watchlist.length > 0 ? (
              watchlist.map(symbol => (
                <StockRow
                  key={symbol}
                  symbol={symbol}
                  apiKey={apiKey}
                  onRemove={removeStock}
                />
              ))
            ) : (
              <div className="p-12 text-center text-gray-400">
                <Layout size={48} className="mx-auto mb-4 opacity-20" />
                <p>目前還沒有自選股，請從上方搜尋並加入。</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-400 text-sm">
        <p>© 2026 StockReview Project • 資料來源：Fugle 富果行情 API</p>
      </footer>
    </div>
  );
};
