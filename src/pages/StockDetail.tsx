import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  fetchTicker, 
  fetchHistoricalCandles, 
  fetchInstitutionalInvestors,
  fetchMarginTrading,
  fetchFinancialStatements,
} from '../api';
import type { 
  StockTicker, 
  StockCandle,
  InstitutionalData,
  MarginData,
  FinancialStatementData,
  ComprehensiveFinancials
} from '../api';
import { KLineChart } from '../components/KLineChart';
import { MarginChart } from '../components/MarginChart';
import { ArrowLeft, Users, CreditCard, PieChart, TrendingUp, TrendingDown, BarChart3, Activity, Wallet } from 'lucide-react';

export const StockDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const [ticker, setTicker] = useState<StockTicker | null>(null);
  const [candles, setCandles] = useState<StockCandle[]>([]);
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

  const [finTab, setFinTab] = useState<'profit' | 'revenue' | 'strength' | 'cash'>('profit');

  const oldestDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (candles.length > 0) {
      oldestDateRef.current = candles[0].date;
    }
  }, [candles]);

  const apiKey = localStorage.getItem('fugle_api_key') || '';

  const loadMoreData = async () => {
    if (!symbol || !apiKey || loading || !oldestDateRef.current) return;
    const oldestDate = new Date(oldestDateRef.current);
    oldestDate.setDate(oldestDate.getDate() - 1);
    const newTo = oldestDate.toISOString().split('T')[0];
    try {
      const newCandles = await fetchHistoricalCandles(symbol, apiKey, timeframe, 180, newTo);
      if (newCandles.length > 0) {
        setCandles(current => {
          const combined = [...newCandles, ...current];
          const unique = Array.from(new Map(combined.map(item => [item.date, item])).values());
          return unique.sort((a, b) => a.date.localeCompare(b.date));
        });
      }
    } catch (error) {
      console.error('Error loading more history:', error);
    }
  };

  useEffect(() => {
    const loadAllData = async () => {
      if (!symbol || !apiKey) return;
      setLoading(true);
      try {
        const [tickerData, candlesData, instData, marginData, finData] = await Promise.all([
          fetchTicker(symbol, apiKey),
          fetchHistoricalCandles(symbol, apiKey, timeframe, 180),
          fetchInstitutionalInvestors(symbol, 45),
          fetchMarginTrading(symbol, 45),
          fetchFinancialStatements(symbol)
        ]);
        setTicker(tickerData);
        setCandles(candlesData);
        setInstitutional(instData);
        setMargin(marginData);
        setFinancials(finData as ComprehensiveFinancials);
      } catch (error) {
        console.error('Error fetching comprehensive data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAllData();
  }, [symbol, apiKey, timeframe]);

  if (!apiKey) return <div className="p-8">請先回首頁設定 API Key</div>;
  if (loading && !ticker && candles.length === 0) return <div className="p-8 flex justify-center"><div className="animate-spin text-blue-600 h-8 w-8 border-4 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {ticker?.symbol} {ticker?.name}
              <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                {ticker?.market} {ticker?.type}
              </span>
            </h1>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* K-Line Chart Section */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
            {['D', 'W', 'M'].map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  timeframe === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'D' ? '日線' : t === 'W' ? '週線' : '月線'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            {['ma', 'bollinger', 'macd'].map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm cursor-pointer capitalize">
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
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 h-[500px] mb-8">
           <KLineChart data={candles} indicators={indicators} onLoadMore={loadMoreData} />
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Institutional Investors */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4 border-l-4 border-blue-500 pl-3">
              <div className="flex items-center gap-2 text-gray-700 font-bold">
                <Users size={20} className="text-blue-500" />
                <h3>三大法人買賣超 (張)</h3>
              </div>
              {institutional.length > 0 && (
                <span className="text-[10px] text-gray-400">
                  最後更新: {institutional[institutional.length - 1].date}
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {institutional.length > 0 ? (
                institutional.slice().reverse().map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-500">{item.date}</span>
                    <span className={`text-sm font-bold ${item.net >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {item.net >= 0 ? '+' : ''}{item.net.toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-gray-400 text-sm">暫無籌碼資料</div>
              )}
            </div>
          </div>

          {/* Margin Trading */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4 border-l-4 border-orange-500 pl-3">
              <div className="flex items-center gap-2 text-gray-700 font-bold">
                <CreditCard size={20} className="text-orange-500" />
                <h3>融資融券趨勢 (近一個月)</h3>
              </div>
              {margin.length > 0 && (
                <span className="text-[10px] text-gray-400">
                  資料日期: {margin[margin.length - 1].date}
                </span>
              )}
            </div>
            <div className="mb-6 h-[200px]">
              {margin.length > 0 ? (
                <MarginChart data={margin} />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  暫無圖表資料
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 text-gray-500 font-medium">
                  <tr>
                    <th className="px-2 py-2">日期</th>
                    <th className="px-2 py-2 text-orange-600">融資餘額</th>
                    <th className="px-2 py-2">增減</th>
                    <th className="px-2 py-2 text-blue-600">融券餘額</th>
                    <th className="px-2 py-2">增減</th>
                    <th className="px-2 py-2">券資比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {margin.slice().reverse().slice(0, 5).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-2 py-2 text-gray-400 font-mono">{row.date.slice(5)}</td>
                      <td className="px-2 py-2 font-medium">{row.marginBalance.toLocaleString()}</td>
                      <td className={`px-2 py-2 font-bold ${row.marginChange >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {row.marginChange > 0 ? '+' : ''}{row.marginChange.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 font-medium">{row.shortBalance.toLocaleString()}</td>
                      <td className={`px-2 py-2 font-bold ${row.shortChange >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {row.shortChange > 0 ? '+' : ''}{row.shortChange.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-gray-600 font-medium">{row.ratio.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Financial Statements */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-2 text-gray-700 font-bold border-l-4 border-purple-500 pl-3">
              <PieChart size={20} className="text-purple-500" />
              <h3>財務報表分析</h3>
            </div>
            <div className="flex bg-gray-100 p-1 rounded-lg self-start">
              <button onClick={() => setFinTab('profit')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${finTab === 'profit' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}><TrendingUp size={14} /> 獲利能力</button>
              <button onClick={() => setFinTab('revenue')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${finTab === 'revenue' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}><BarChart3 size={14} /> 營收表現</button>
              <button onClick={() => setFinTab('strength')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${finTab === 'strength' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}><Activity size={14} /> 財務結構</button>
              <button onClick={() => setFinTab('cash')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${finTab === 'cash' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}><Wallet size={14} /> 現金流量</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {financials.eps.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">季度</th>
                    {finTab === 'profit' && (
                      <>
                        <th className="px-4 py-3 text-purple-600 font-bold">本期淨利 (百萬)</th>
                        <th className="px-4 py-3">EPS (元)</th>
                        <th className="px-4 py-3">毛利率 (%)</th>
                        <th className="px-4 py-3 rounded-r-lg">營業利益率 (%)</th>
                      </>
                    )}
                    {finTab === 'revenue' && <th className="px-4 py-3 rounded-r-lg">營業收入 (百萬)</th>}
                    {finTab === 'strength' && (
                      <>
                        <th className="px-4 py-3">負債比率 (%)</th>
                        <th className="px-4 py-3 rounded-r-lg">ROE (%)</th>
                      </>
                    )}
                    {finTab === 'cash' && <th className="px-4 py-3 rounded-r-lg">營業現金流 (百萬)</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
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
                      <tr key={date} className="hover:bg-gray-50 group">
                        <td className="px-4 py-3 font-medium text-gray-900">{date}</td>
                        {finTab === 'profit' && (
                          <>
                            <td className="px-4 py-3 font-mono text-purple-700">
                              {ni ? (ni / 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                            </td>
                            <td className={`px-4 py-3 font-bold ${item.value >= 0 ? 'text-gray-900' : 'text-green-600'}`}>{item.value.toFixed(2)}</td>
                            <td className="px-4 py-3 text-gray-600">{gm ? gm.toFixed(2) : '-'}%</td>
                            <td className="px-4 py-3 text-gray-600">{om ? om.toFixed(2) : '-'}%</td>
                          </>
                        )}
                        {finTab === 'revenue' && (
                          <td className="px-4 py-3 text-gray-900 font-mono">
                            {rev ? (rev / 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                          </td>
                        )}
                        {finTab === 'strength' && (
                          <>
                            <td className={`px-4 py-3 ${debt && debt > 60 ? 'text-red-500 font-bold' : 'text-gray-600'}`}>{debt ? debt.toFixed(2) : '-'}%</td>
                            <td className="px-4 py-3 text-gray-600">{roe ? roe.toFixed(2) : '-'}%</td>
                          </>
                        )}
                        {finTab === 'cash' && (
                          <td className={`px-4 py-3 font-mono ${ocf && ocf < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                            {ocf ? (ocf / 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '-'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-400">暫無詳細財報數據</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
