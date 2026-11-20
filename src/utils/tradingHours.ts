/**
 * 台股開休市時段與國定假日／下午四點盤後守門員
 * - 週一至週五 09:00 ~ 13:35：盤中開盤，允許初次抓取與每 15 秒即時輪詢
 * - 週一至週五 13:36 ~ 15:59：已收盤但後端 16:00 尚未入庫，僅初次抓取 1 次補收盤價，不輪詢
 * - 週一至週五 16:00 ~ 23:59：資料庫已有當日正式資料，完全不打大盤即時 API、不輪詢
 * - 週一至週五 00:00 ~ 08:59：尚未開盤，完全不打即時 API、不輪詢
 * - 週六、週日、固定國定假日，或由證交所報價時間戳自動偵測為休市日（如春節/端午/中秋/颱風假）：完全不輪詢
 */

const FIXED_SOLAR_HOLIDAYS = new Set([
  '01-01', // 元旦
  '02-28', // 和平紀念日
  '05-01', // 勞動節
  '10-10', // 國慶日
]);

// 當平日盤中第一次探測發現證交所回傳的報價日期仍停留在前一交易日，自動鎖定當日為休市日 (春節/連假/颱風假)
let detectedHolidayDateStr: string | null = null;

export interface TaiwanDateTimeInfo {
  dateStr: string; // YYYY-MM-DD
  mmdd: string; // MM-DD
  dayOfWeek: number; // 0 (週日) ~ 6 (週六)
  hours: number;
  minutes: number;
  timeInMinutes: number;
}

export function getTaiwanDateTime(now: Date = new Date()): TaiwanDateTimeInfo {
  const ts = now.getTime();
  const tw = new Date((Number.isNaN(ts) ? Date.now() : ts) + 8 * 3600 * 1000);
  const iso = tw.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ (in UTC+8)
  const dateStr = iso.slice(0, 10);
  const mmdd = iso.slice(5, 10);
  const dayOfWeek = tw.getUTCDay();
  const hours = tw.getUTCHours();
  const minutes = tw.getUTCMinutes();
  return {
    dateStr,
    mmdd,
    dayOfWeek,
    hours,
    minutes,
    timeInMinutes: hours * 60 + minutes,
  };
}

export function extractQuoteTaiwanDate(lastUpdated?: string): string {
  if (!lastUpdated) return getTaiwanDateTime().dateStr;
  const parsed = new Date(lastUpdated);
  if (Number.isNaN(parsed.getTime())) return getTaiwanDateTime().dateStr;
  return getTaiwanDateTime(parsed).dateStr;
}

export function markTodayAsMarketHoliday(dateStr?: string): void {
  detectedHolidayDateStr = dateStr || getTaiwanDateTime().dateStr;
}

/**
 * 檢查回傳的即時報價日期是否為今日；
 * 若在平日 09:05 後發現證交所報價日期仍停在過去日期，代表今日為國定假日或颱風假休市，自動鎖定休市不再輪詢
 */
export function verifyQuoteIsTodayOrLockHoliday(lastUpdated?: string): boolean {
  if (!lastUpdated) return true;
  const nowTw = getTaiwanDateTime();
  const quoteDate = extractQuoteTaiwanDate(lastUpdated);
  if (quoteDate < nowTw.dateStr && nowTw.timeInMinutes >= 9 * 60 + 2) {
    markTodayAsMarketHoliday(nowTw.dateStr);
    return false;
  }
  return quoteDate === nowTw.dateStr;
}

export type MarketSessionType =
  | 'market_open'
  | 'post_close_pre_sync'
  | 'after_4pm'
  | 'pre_open'
  | 'weekend_or_holiday';

export interface MarketSessionStatus {
  session: MarketSessionType;
  todayStr: string;
  /** 大盤頁初次載入時是否需要呼叫 fetchQuote('t00') */
  shouldFetchMarketInitialQuote: boolean;
  /** 是否處於盤中 09:00 ~ 13:35 可進行每 15/30 秒自動輪詢 */
  shouldPollRealtime: boolean;
  statusLabel: string;
}

export function getTaiwanMarketSession(now: Date = new Date()): MarketSessionStatus {
  const tw = getTaiwanDateTime(now);
  const isWeekend = tw.dayOfWeek === 0 || tw.dayOfWeek === 6;
  const isHoliday =
    FIXED_SOLAR_HOLIDAYS.has(tw.mmdd) || detectedHolidayDateStr === tw.dateStr;

  if (isWeekend || isHoliday) {
    return {
      session: 'weekend_or_holiday',
      todayStr: tw.dateStr,
      shouldFetchMarketInitialQuote: false,
      shouldPollRealtime: false,
      statusLabel: isWeekend ? '週末休市' : '今日休市',
    };
  }

  // 00:00 ~ 08:59 開盤前
  if (tw.timeInMinutes < 9 * 60) {
    return {
      session: 'pre_open',
      todayStr: tw.dateStr,
      shouldFetchMarketInitialQuote: false,
      shouldPollRealtime: false,
      statusLabel: '尚未開盤',
    };
  }

  // 09:00 ~ 13:35 盤中交易時段
  if (tw.timeInMinutes <= 13 * 60 + 35) {
    return {
      session: 'market_open',
      todayStr: tw.dateStr,
      shouldFetchMarketInitialQuote: true,
      shouldPollRealtime: true,
      statusLabel: '盤中即時試算中',
    };
  }

  // 13:36 ~ 15:59 已收盤但後端 16:00 尚未同步入庫：僅初次抓 1 次補收盤 K 線，不輪詢
  if (tw.timeInMinutes < 16 * 60) {
    return {
      session: 'post_close_pre_sync',
      todayStr: tw.dateStr,
      shouldFetchMarketInitialQuote: true,
      shouldPollRealtime: false,
      statusLabel: '今日已收盤 (待16:00結算籌碼)',
    };
  }

  // 16:00 ~ 23:59 下午四點後資料庫已入庫，完全不打即時 API、不輪詢
  return {
    session: 'after_4pm',
    todayStr: tw.dateStr,
    shouldFetchMarketInitialQuote: false,
    shouldPollRealtime: false,
    statusLabel: '盤後資料已結算',
  };
}
