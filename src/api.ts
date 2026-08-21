import axios from 'axios';

const CLOUD_API_URL = 'https://cloud-stock-chooser.mrmosssir.workers.dev/api/stock-history';
const CLOUD_PROXY_QUOTE_URL = 'https://cloud-stock-chooser.mrmosssir.workers.dev/api/get-realtime-quotes';

export interface StockTicker {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  market: string;
  issuedShares?: number;
}

export interface StockQuote {
  symbol: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  lastUpdated: string;
}

export interface StockCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DividendData {
  date: string;
  beforePrice: number;
  afterPrice: number;
}

export const adjustCandles = (candles: StockCandle[], dividends: DividendData[]): StockCandle[] => {
  if (!dividends || dividends.length === 0 || !candles || candles.length === 0) return candles;
  
  const sortedDividends = [...dividends].sort((a, b) => a.date.localeCompare(b.date));
  const result = [...candles];
  let divIndex = sortedDividends.length - 1;
  let currentFactor = 1.0;
  
  for (let i = result.length - 1; i >= 0; i--) {
    let candle = { ...result[i] };
    
    while (divIndex >= 0 && candle.date < sortedDividends[divIndex].date) {
      const div = sortedDividends[divIndex];
      if (div.beforePrice > 0) {
        currentFactor *= (div.afterPrice / div.beforePrice);
      }
      divIndex--;
    }
    
    if (currentFactor !== 1.0) {
      candle.open = Number((candle.open * currentFactor).toFixed(2));
      candle.high = Number((candle.high * currentFactor).toFixed(2));
      candle.low = Number((candle.low * currentFactor).toFixed(2));
      candle.close = Number((candle.close * currentFactor).toFixed(2));
      candle.volume = Math.round(candle.volume / currentFactor);
    }
    
    result[i] = candle;
  }
  
  return result;
}

export interface StockCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const fetchHistoricalCandles = async (
  symbol: string,
  _timeframe: string = 'D',
  rangeDays: number = 360,
  endDateStr?: string
): Promise<StockCandle[]> => {
  const end = endDateStr ? new Date(endDateStr) : new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - rangeDays);

  const from = start.toISOString().split('T')[0];
  const to = end.toISOString().split('T')[0];

  try {
    const response = await axios.get(`${CLOUD_API_URL}?id=${symbol}`);
    const rawData = response.data?.data;
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }

    const data = rawData
      .filter((item: any) => item.date >= from && item.date <= to)
      .map((item: any) => ({
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume
      }));

    return data; // Data from R2 is already sorted chronologically
  } catch (error: any) {
    console.error(`Error fetching candles from ${from} to ${to}:`, error);
    return [];
  }
};

export const fetchTicker = async (symbol: string): Promise<StockTicker> => {
  try {
    const fetchUrl = `https://cloud-stock-chooser.mrmosssir.workers.dev/api/stock-info?id=${symbol}`;
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch stock info, status: ${response.status}`);
    }
    const data = await response.json();
    return {
      symbol: data.symbol,
      name: data.name,
      type: data.type || 'EQUITY',
      exchange: data.exchange || '',
      market: '',
      issuedShares: data.issuedShares ? Number(data.issuedShares) : 0,
    };
  } catch (e) {
    console.error('Error fetching ticker info from backend:', e);
    return {
      symbol,
      name: '',
      type: 'EQUITY',
      exchange: '',
      market: '',
      issuedShares: 0,
    };
  }
};

export const fetchTickers = async (symbols: string[]): Promise<Record<string, StockTicker>> => {
  if (symbols.length === 0) return {};
  try {
    const fetchUrl = `https://cloud-stock-chooser.mrmosssir.workers.dev/api/stock-info?ids=${symbols.join(',')}`;
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`Failed to fetch tickers, status: ${response.status}`);
    const data = await response.json();
    const result: Record<string, StockTicker> = {};
    if (Array.isArray(data)) {
      data.forEach((item: any) => {
        result[item.symbol] = {
          symbol: item.symbol,
          name: item.name,
          type: item.type || 'EQUITY',
          exchange: item.exchange || '',
          market: '',
          issuedShares: item.issuedShares ? Number(item.issuedShares) : 0,
        };
      });
    }
    return result;
  } catch (e) {
    console.error('Error fetching tickers info from backend:', e);
    return {};
  }
};

export const fetchQuote = async (symbol: string): Promise<StockQuote> => {
  // 透過 Cloudflare Worker 代理打證交所 API (由後端負責清洗資料與格式化)
  const fetchUrl = `${CLOUD_PROXY_QUOTE_URL}?symbol=${symbol}`;
  const response = await fetch(fetchUrl);
  const result = await response.json();

  if (!result.success || !result.data || result.data.length === 0) {
    throw new Error('No quote data found from MIS API');
  }

  const data = result.data[0];

  return {
    symbol: data.symbol,
    lastPrice: data.lastPrice,
    change: data.change,
    changePercent: data.changePercent,
    open: data.open,
    high: data.high,
    low: data.low,
    volume: data.volume,
    lastUpdated: data.lastUpdated,
  };
};

export const fetchQuotes = async (symbols: string[]): Promise<Record<string, StockQuote>> => {
  if (symbols.length === 0) return {};
  try {
    const fetchUrl = `${CLOUD_PROXY_QUOTE_URL}?symbols=${symbols.join(',')}`;
    const response = await fetch(fetchUrl);
    const result = await response.json();
    if (!result.success || !result.data) return {};
    
    const map: Record<string, StockQuote> = {};
    result.data.forEach((item: any) => {
      map[item.symbol] = {
        symbol: item.symbol,
        lastPrice: item.lastPrice,
        change: item.change,
        changePercent: item.changePercent,
        open: item.open,
        high: item.high,
        low: item.low,
        volume: item.volume,
        lastUpdated: item.lastUpdated,
      };
    });
    return map;
  } catch (e) {
    console.error('Error fetching quotes from backend:', e);
    return {};
  }
};

// --- FinMind API Section ---
const FINMIND_BASE_URL = 'https://api.finmindtrade.com/api/v4/data';

export interface InstitutionalData {
  date: string;
  net: number;
  netForeign: number;
  netTrust: number;
  netDealer: number;
}

export interface MarginData {
  date: string;
  marginBalance: number;
  marginChange: number;
  shortBalance: number;
  shortChange: number;
  ratio: number;
}

export interface FinancialStatementData {
  date: string;
  type: string;
  value: number;
}

export interface ComprehensiveFinancials {
  revenue: FinancialStatementData[];
  grossMargin: FinancialStatementData[];
  operatingMargin: FinancialStatementData[];
  netIncome: FinancialStatementData[];
  eps: FinancialStatementData[];
  debtRatio: FinancialStatementData[];
  roe: FinancialStatementData[];
  ocf: FinancialStatementData[]; 
}

export const fetchDividends = async (symbol: string, rangeDays: number = 3600): Promise<DividendData[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - rangeDays);
  const startStr = startDate.toISOString().split('T')[0];

  try {
    const response = await axios.get(FINMIND_BASE_URL, {
      params: {
        dataset: 'TaiwanStockDividendResult',
        data_id: symbol,
        start_date: startStr
      }
    });

    const rawData = response.data?.data;
    if (!rawData || !Array.isArray(rawData)) return [];

    return rawData.map((item: any) => ({
      date: item.date,
      beforePrice: Number(item.before_price) || 1,
      afterPrice: Number(item.after_price) || 1
    }));
  } catch (error) {
    console.error('FinMind Dividend Fetch Error:', error);
    return [];
  }
};

export const fetchInstitutionalInvestors = async (symbol: string, days: number = 45): Promise<InstitutionalData[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];

  try {
    const response = await axios.get(`${CLOUD_API_URL}?id=${symbol}`);
    const rawData = response.data?.data;
    if (!Array.isArray(rawData) || rawData.length === 0) return [];

    const data = rawData
      .filter((item: any) => item.date >= startStr)
      .map((item: any) => ({
        date: item.date,
        net: (item.netForeign || 0) + (item.netTrust || 0) + (item.netDealer || 0),
        netForeign: item.netForeign || 0,
        netTrust: item.netTrust || 0,
        netDealer: item.netDealer || 0,
      }));

    return data;
  } catch (error) {
    console.error('Cloud API Institutional Fetch Error:', error);
    return [];
  }
};

export const fetchMarginTrading = async (symbol: string, days: number = 45): Promise<MarginData[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];

  try {
    const response = await axios.get(FINMIND_BASE_URL, {
      params: {
        dataset: 'TaiwanStockMarginPurchaseShortSale',
        data_id: symbol,
        start_date: startStr
      }
    });

    const rawData = response.data.data;
    if (!rawData || !Array.isArray(rawData)) return [];

    return rawData.map((item: any) => {
      const marginBalance = Number(item.MarginPurchaseTodayBalance) || 0;
      const shortBalance = Number(item.ShortSaleTodayBalance) || 0;
      const prevMargin = Number(item.MarginPurchaseYesterdayBalance) || 0;
      const prevShort = Number(item.ShortSaleYesterdayBalance) || 0;

      return {
        date: item.date,
        marginBalance,
        marginChange: marginBalance - prevMargin,
        shortBalance,
        shortChange: shortBalance - prevShort,
        ratio: marginBalance > 0 ? (shortBalance / marginBalance) * 100 : 0
      };
    });
  } catch (error) {
    console.error('FinMind Margin Fetch Error:', error);
    return [];
  }
};

export const fetchFinancialStatements = async (symbol: string): Promise<ComprehensiveFinancials> => {
  try {
    const [fsRes, bsRes, cfRes] = await Promise.all([
      axios.get(FINMIND_BASE_URL, { params: { dataset: 'TaiwanStockFinancialStatements', data_id: symbol, start_date: '2022-01-01' } }),
      axios.get(FINMIND_BASE_URL, { params: { dataset: 'TaiwanStockBalanceSheet', data_id: symbol, start_date: '2022-01-01' } }),
      axios.get(FINMIND_BASE_URL, { params: { dataset: 'TaiwanStockCashFlowsStatement', data_id: symbol, start_date: '2022-01-01' } })
    ]);

    const fsRaw = fsRes.data.data || [];
    const bsRaw = bsRes.data.data || [];
    const cfRaw = cfRes.data.data || [];

    const byDate: Record<string, { fs: any, bs: any, cf: any }> = {};

    const addToGroup = (items: any[], source: 'fs' | 'bs' | 'cf') => {
      items.forEach((item: any) => {
        if (!byDate[item.date]) byDate[item.date] = { fs: {}, bs: {}, cf: {} };
        byDate[item.date][source][item.type] = Number(item.value);
      });
    };

    addToGroup(fsRaw, 'fs');
    addToGroup(bsRaw, 'bs');
    addToGroup(cfRaw, 'cf');

    const result: ComprehensiveFinancials = {
      revenue: [], grossMargin: [], operatingMargin: [], netIncome: [], eps: [], debtRatio: [], roe: [], ocf: []
    };

    Object.keys(byDate).sort().forEach(date => {
      const { fs, bs, cf } = byDate[date];
      
      const revenue = fs['Revenue'] || fs['營業收入'] || fs['RevenueIncome'];
      const eps = fs['EPS'] || fs['每股盈餘'] || fs['EarningsPerShare'] || fs['基本每股盈餘'] || fs['基本每股盈餘（元）'];
      const grossProfit = fs['GrossProfit'] || fs['營業毛利（毛損）'] || fs['營業毛利'];
      const operatingIncome = fs['OperatingIncome'] || fs['營業利益（損失）'] || fs['營業利益'];
      const netIncome = fs['IncomeAfterTaxes'] || fs['EquityAttributableToOwnersOfParent'] || fs['NetIncome'] || fs['本期淨利（淨損）'] || fs['NetProfit'];

      const totalAssets = bs['TotalAssets'] || bs['Assets'] || bs['資產總額'];
      const totalLiabilities = bs['Liabilities'] || bs['TotalLiabilities'] || bs['負債總額'];
      const totalEquity = bs['Equity'] || bs['TotalEquity'] || bs['權益總額'] || bs['EquityAttributableToOwnersOfParent'];

      const ocf = cf['CashFlowsFromOperatingActivities'] || cf['NetCashFlowFromOperatingActivities'] || cf['營業活動之淨現金流入（流出）'];

      if (revenue) result.revenue.push({ date, type: 'Revenue', value: revenue });
      if (eps) result.eps.push({ date, type: 'EPS', value: eps });
      if (netIncome) result.netIncome.push({ date, type: 'NetIncome', value: netIncome });
      if (grossProfit && revenue) result.grossMargin.push({ date, type: 'GrossMargin', value: (grossProfit / revenue) * 100 });
      if (operatingIncome && revenue) result.operatingMargin.push({ date, type: 'OperatingMargin', value: (operatingIncome / revenue) * 100 });
      if (totalLiabilities && totalAssets) result.debtRatio.push({ date, type: 'DebtRatio', value: (totalLiabilities / totalAssets) * 100 });
      if (netIncome && totalEquity) result.roe.push({ date, type: 'ROE', value: (netIncome / totalEquity) * 100 });
      if (ocf) result.ocf.push({ date, type: 'OCF', value: ocf });
    });

    return result;
  } catch (error) {
    console.error('FinMind Financial Fetch Error:', error);
    return { revenue: [], grossMargin: [], operatingMargin: [], netIncome: [], eps: [], debtRatio: [], roe: [], ocf: [] };
  }
};

export const fetchLatestPicks = async (): Promise<{ symbol: string; [key: string]: any }[]> => {
  try {
    const response = await fetch('https://cloud-stock-chooser.mrmosssir.workers.dev/api/latest-picks');
    const result = await response.json();
    if (result.success && Array.isArray(result.data)) {
      return result.data;
    }
    return [];
  } catch (error) {
    console.error('Error fetching latest picks:', error);
    return [];
  }
};