import type { StockCandle, InstitutionalData, MarketDailyRecord } from '../api';

/**
 * 取得指定日期的所屬週一日期字串 (YYYY-MM-DD)，作為自然週的分組依據
 */
export function getWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0 是週日, 1 是週一, ..., 6 是週六
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return date.toISOString().split('T')[0];
}

/**
 * 取得指定日期的月份字串 (YYYY-MM)，作為月份的分組依據
 */
export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * 將個股日 K 線聚合為週線 (W) 或月線 (M)
 */
export function aggregateCandles(
  candles: StockCandle[],
  timeframe: 'D' | 'W' | 'M' | string
): StockCandle[] {
  if (!candles || candles.length === 0 || timeframe === 'D') {
    return candles;
  }

  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const groups: Map<string, StockCandle[]> = new Map();

  for (const candle of sorted) {
    const key = timeframe === 'W' ? getWeekKey(candle.date) : getMonthKey(candle.date);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(candle);
  }

  const aggregated: StockCandle[] = [];

  for (const group of groups.values()) {
    if (group.length === 0) continue;

    const first = group[0];
    const last = group[group.length - 1];

    let high = first.high;
    let low = first.low;
    let totalVolume = 0;

    for (const c of group) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      totalVolume += c.volume || 0;
    }

    aggregated.push({
      date: last.date, // 以該週/月最後一個交易日作為此根 K 線的日期
      open: first.open,
      high,
      low,
      close: last.close,
      volume: totalVolume,
    });
  }

  return aggregated.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 將三大法人日買賣超聚合為週或月累計
 */
export function aggregateInstitutional(
  data: InstitutionalData[],
  timeframe: 'D' | 'W' | 'M' | string
): InstitutionalData[] {
  if (!data || data.length === 0 || timeframe === 'D') {
    return data;
  }

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const groups: Map<string, InstitutionalData[]> = new Map();

  for (const item of sorted) {
    const key = timeframe === 'W' ? getWeekKey(item.date) : getMonthKey(item.date);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  const aggregated: InstitutionalData[] = [];

  for (const group of groups.values()) {
    if (group.length === 0) continue;

    const last = group[group.length - 1];
    let net = 0;
    let netForeign = 0;
    let netTrust = 0;
    let netDealer = 0;

    for (const item of group) {
      net += item.net || 0;
      netForeign += item.netForeign || 0;
      netTrust += item.netTrust || 0;
      netDealer += item.netDealer || 0;
    }

    aggregated.push({
      date: last.date,
      net,
      netForeign,
      netTrust,
      netDealer,
    });
  }

  return aggregated.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 將大盤每日記錄聚合為週線或月線
 */
export function aggregateMarketRecords(
  records: MarketDailyRecord[],
  timeframe: 'D' | 'W' | 'M' | string
): MarketDailyRecord[] {
  if (!records || records.length === 0 || timeframe === 'D') {
    return records;
  }

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const groups: Map<string, MarketDailyRecord[]> = new Map();

  for (const record of sorted) {
    const key = timeframe === 'W' ? getWeekKey(record.date) : getMonthKey(record.date);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(record);
  }

  const aggregated: MarketDailyRecord[] = [];
  let prevClose: number | null = null;

  for (const group of groups.values()) {
    if (group.length === 0) continue;

    const first = group[0];
    const last = group[group.length - 1];

    let high = first.high;
    let low = first.low;
    let totalVolume = 0;
    let totalTradeValue = 0;
    let totalForeignNet = 0;
    let totalTrustNet = 0;
    let totalDealerNet = 0;
    let totalInstNet = 0;
    let totalMarginDiff = 0;
    let totalShortDiff = 0;

    for (const r of group) {
      if (r.high > high) high = r.high;
      if (r.low < low) low = r.low;
      totalVolume += r.volume || 0;
      totalTradeValue += r.tradeValue || 0;
      totalForeignNet += r.foreignNet || 0;
      totalTrustNet += r.trustNet || 0;
      totalDealerNet += r.dealerNet || 0;
      totalInstNet += r.totalInstNet || 0;
      totalMarginDiff += r.marginDiff || 0;
      totalShortDiff += r.shortDiff || 0;
    }

    const change = prevClose !== null ? Number((last.close - prevClose).toFixed(2)) : 0;
    prevClose = last.close;

    aggregated.push({
      date: last.date,
      open: first.open,
      high,
      low,
      close: last.close,
      volume: totalVolume,
      tradeValue: totalTradeValue,
      change,
      foreignNet: totalForeignNet,
      trustNet: totalTrustNet,
      dealerNet: totalDealerNet,
      totalInstNet: totalInstNet,
      foreignFuturesOI: last.foreignFuturesOI,
      marginBalance: last.marginBalance,
      marginDiff: totalMarginDiff,
      shortBalance: last.shortBalance,
      shortDiff: totalShortDiff,
      score: 50,
      status: 'consolidation',
      statusText: '區間震盪',
      summary: '',
      isIntraday: last.isIntraday,
    });
  }

  return aggregated.sort((a, b) => a.date.localeCompare(b.date));
}
