import axios from 'axios';

const FUGLE_BASE_URL = '/v1.0';

export interface StockTicker {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  market: string;
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

export const fetchHistoricalCandles = async (
  symbol: string,
  apiKey: string,
  timeframe: string = 'D',
  rangeDays: number = 180,
  endDateStr?: string
): Promise<StockCandle[]> => {
  const end = endDateStr ? new Date(endDateStr) : new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - rangeDays);

  const from = start.toISOString().split('T')[0];
  const to = end.toISOString().split('T')[0];

  try {
    const response = await axios.get(`${FUGLE_BASE_URL}/stock/historical/candles/${symbol}`, {
      headers: { 'X-API-KEY': apiKey },
      params: {
        from,
        to,
        timeframe,
        fields: 'open,high,low,close,volume'
      }
    });
    
    const rawData = response.data?.data;
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }

    const data = rawData.map((item: any) => ({
      date: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume
    }));

    return data.reverse();
  } catch (error: any) {
    console.error(`Error fetching candles from ${from} to ${to}:`, error.response?.data || error.message);
    return [];
  }
};

export const fetchTicker = async (symbol: string, apiKey: string): Promise<StockTicker> => {
  const response = await axios.get(`${FUGLE_BASE_URL}/stock/intraday/ticker/${symbol}`, {
    headers: { 'X-API-KEY': apiKey },
  });
  return {
    symbol: response.data.symbol,
    name: response.data.name,
    type: response.data.type,
    exchange: response.data.exchange,
    market: response.data.market,
  };
};

export const fetchQuote = async (symbol: string, apiKey: string): Promise<StockQuote> => {
  const response = await axios.get(`${FUGLE_BASE_URL}/stock/intraday/quote/${symbol}`, {
    headers: { 'X-API-KEY': apiKey },
  });
  const data = response.data;
  return {
    symbol: data.symbol,
    lastPrice: data.lastPrice,
    change: data.change,
    changePercent: data.changePercent,
    open: data.openPrice,
    high: data.highPrice,
    low: data.lowPrice,
    volume: data.volume,
    lastUpdated: data.updatedAt,
  };
};

// --- FinMind API Section ---
const FINMIND_BASE_URL = '/finmind';

export interface InstitutionalData {
  date: string;
  net: number;
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

export const fetchInstitutionalInvestors = async (symbol: string, days: number = 45): Promise<InstitutionalData[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];

  try {
    const response = await axios.get(FINMIND_BASE_URL, {
      params: {
        dataset: 'TaiwanStockInstitutionalInvestorsBuySell',
        data_id: symbol,
        start_date: startStr
      }
    });

    const rawData = response.data.data;
    if (!rawData || !Array.isArray(rawData)) return [];

    const grouped = rawData.reduce((acc: any, item: any) => {
      const net = (Number(item.buy) || 0) - (Number(item.sell) || 0);
      if (!acc[item.date]) acc[item.date] = 0;
      acc[item.date] += net;
      return acc;
    }, {});

    return Object.keys(grouped).map(date => ({
      date,
      net: grouped[date]
    })).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('FinMind Institutional Fetch Error:', error);
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

    return rawData.map((item: any, index: number) => {
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