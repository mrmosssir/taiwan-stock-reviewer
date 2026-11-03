import { SMA, MACD, Stochastic, BollingerBands, RSI, ADX } from 'technicalindicators';
import type { StockCandle, InstitutionalData, StockTicker, ComprehensiveFinancials, MarketDailyRecord } from '../api';
import type { SeriesMarker, Time } from 'lightweight-charts';

// Helper to pad results to match input length
const padData = (input: number[], result: number[]): (number | null)[] => {
  const diff = input.length - result.length;
  const padded = new Array(diff).fill(null);
  return [...padded, ...result];
};

// Helper to normalize date string to YYYY-MM-DD
const normalizeDate = (d: string) => d.split('T')[0].replace(/\//g, '-');

type TrendState = 'long' | null;

// 動態判定是否為大型權值股 (方案 A：股票市值判定)
const isLargeCapStock = (
  candles: StockCandle[],
  ticker: StockTicker | null,
  financials?: ComprehensiveFinancials
): boolean => {
  if (ticker?.market === 'OTC') {
    // 上櫃股原則上歸類為中小型股
    return false;
  }

  // 1. 權值巨頭代號作為預設確認
  const megaCapSymbols = ['2330', '2317', '2454', '2308', '2337', '2382', '2881', '2882', '2891', '2412', '2886', '2884', '2892', '1301', '1303', '2002'];
  if (ticker && megaCapSymbols.includes(ticker.symbol)) {
    return true;
  }

  // 2. 動態股票市值判定 (方案 A：當日收盤價 * 發行股數)
  if (ticker && ticker.issuedShares && ticker.issuedShares > 0 && candles.length > 0) {
    const latestClose = candles[candles.length - 1].close;
    const marketCap = latestClose * ticker.issuedShares;
    // 市值大於 1,000 億台幣視為大型權值股
    if (marketCap > 100000000000) {
      return true;
    }
    return false;
  }

  // 3. 備援判定：檢查最新季營收規模 (Revenue) > 200億
  let latestRevenue = 0;
  if (financials && financials.revenue.length > 0) {
    latestRevenue = financials.revenue[financials.revenue.length - 1].value;
  }
  if (latestRevenue > 20000000000) {
    return true;
  }

  // 移除了易受短線暴增干擾的 avgTurnover > 5億 條件，確保妖股爆量不會被誤判為大型股
  return false;
};

export const SIGNAL_STRATEGIES = [
  { id: 'trend_v1', name: '波段趨勢策略 (原版)' },
  { id: 'strategy_2', name: '強勢突破模型 (三碼實戰)' }
];

const calculateTrendStrategy = (
  candles: StockCandle[],
  institutional: InstitutionalData[],
  ticker: StockTicker | null = null,
  financials?: ComprehensiveFinancials
): SeriesMarker<Time>[] => {
  if (candles.length < 60) {
    return [];
  }

  const isLargeCap = isLargeCapStock(candles, ticker, financials);

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const dates = candles.map(c => c.date);

  // 1. Calculate Technical Indicators
  const ma5 = padData(closes, SMA.calculate({ period: 5, values: closes }));
  const ma10 = padData(closes, SMA.calculate({ period: 10, values: closes }));
  const ma20 = padData(closes, SMA.calculate({ period: 20, values: closes }));
  
  // Volume MA for filters
  const ma5Vol = padData(volumes, SMA.calculate({ period: 5, values: volumes }));
  const ma20Vol = padData(volumes, SMA.calculate({ period: 20, values: volumes }));

  const macdInput = {
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  };
  const macdRaw = MACD.calculate(macdInput);
  const diffMacd = closes.length - macdRaw.length;
  const macdHist = new Array(diffMacd).fill(null).concat(macdRaw.map(m => m.histogram));

  const stochInput = {
    high: highs,
    low: lows,
    close: closes,
    period: 9,
    signalPeriod: 3
  };
  const stochRaw = Stochastic.calculate(stochInput);
  const diffStoch = closes.length - stochRaw.length;
  const kLine = new Array(diffStoch).fill(null).concat(stochRaw.map(s => s.k));
  const dLine = new Array(diffStoch).fill(null).concat(stochRaw.map(s => s.d));

  // Bollinger Bands
  const bbRaw = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const bbUpper = padData(closes, bbRaw.map(b => b.upper));
  const bbWidth = padData(closes, bbRaw.map(b => (b.upper - b.lower) / b.middle));

  // RSI
  const rsiRaw = RSI.calculate({ period: 14, values: closes });
  const rsi = padData(closes, rsiRaw);

  // 2. Align Chip Data
  const instMap = new Map(institutional.map(i => [normalizeDate(i.date), i]));

  const markers: SeriesMarker<Time>[] = [];
  let currentTrend: TrendState = null;
  let trendDuration = 0;
  let startPrice = 0;
  let highestPrice = 0;
  let lastAddIndex = 0;
  let addCount = 0;

  // 3. Iterate and Check Conditions
  for (let i = 60; i < candles.length; i++) {
    const date = dates[i];
    const close = closes[i];
    const openPrice = candles[i].open;
    const prevClose = closes[i-1];
    const prev2Close = closes[i-2];
    const high = highs[i];
    const low = lows[i];
    const vol = volumes[i];
    
    // Indicators
    const m5 = ma5[i] ?? 0;
    const m10 = ma10[i] ?? 0;
    const m20 = ma20[i] ?? 0;
    const m5v = ma5Vol[i] ?? 0;
    const m20v = ma20Vol[i] ?? 0;
    const mh = macdHist[i] ?? 0;
    const prevMh = macdHist[i-1] ?? 0;
    const k = kLine[i] ?? 0;
    const d = dLine[i] ?? 0;
    
    const bbU = bbUpper[i] ?? 0;
    const bbW = bbWidth[i] ?? 0;
    const prevBbW = bbWidth[i-1] ?? 0;
    const rsiVal = rsi[i] ?? 50;

    // Chip Data Helper
    const getInst = (offset: number) => {
      if (i - offset < 0) return { net: 0, netForeign: 0, netTrust: 0, netDealer: 0 };
      return instMap.get(normalizeDate(dates[i - offset])) || { net: 0, netForeign: 0, netTrust: 0, netDealer: 0 };
    };

    const instToday = getInst(0);
    const instPrev1 = getInst(1);
    const instPrev2 = getInst(2);

    // 外資與投信近3日買超合力 (主力籌碼參考)
    const major3DaysNet = (instToday.netForeign + instToday.netTrust) + 
                          (instPrev1.netForeign + instPrev1.netTrust) + 
                          (instPrev2.netForeign + instPrev2.netTrust);

    // Helper: Bias calculation
    const bias20 = m20 > 0 ? (close - m20) / m20 : 0;

    // --- State Machine Logic ---
    if (currentTrend === 'long') {
      trendDuration++;
      if (high > highestPrice) {
        highestPrice = high;
      }

      // ----------------------------------------------------
      // 1. 平倉邏輯 (Exit Signals) - 雙軌制平倉防護
      // ----------------------------------------------------

      let shouldExit = false;

      if (isLargeCap) {
        // 大型權值股平倉防護：走勢穩定，需連續 3 日跌破 MA20，或跌破 MA20 且伴隨法人強力連續賣超
        const breakdownMA20 = (close < m20 && prevClose < m20 && prev2Close < m20) || (close < m20 * 0.99 && major3DaysNet < 0);
        // 破前 20 日波段低點
        const prev20Low = Math.min(...lows.slice(i-20, i));
        const structureBreak = close < prev20Low;
        // 起漲防護
        const strictStop = trendDuration <= 10 && (close < startPrice * 0.92);

        shouldExit = breakdownMA20 || structureBreak || strictStop;
      } else {
        // 中小型飆股平倉防護：三階層動態停利架構 (3-Tier Position Management)
        const maxGain = startPrice > 0 ? (highestPrice - startPrice) / startPrice : 0;
        const isClimaxSubside = (openPrice - close) / openPrice > 0.05 && 
                                 (vol / m5v > 3.0) && 
                                 (close - low) / (high - low) < 0.15 &&
                                 (close < m10);
        const strictStop = trendDuration <= 10 && (close < startPrice * 0.92);

        if (maxGain > 0.40) {
          // 【第三層：主升狂飆期】(maxGain > 40%) - 跌破 10MA 兩天內站不回去
          const prevM10 = ma10[i-1] ?? 0;
          const breakdownMA10TwoDays = close < m10 && prevClose < prevM10;
          const breakdownMA20 = close < m20;
          const trailingStop = close < highestPrice * 0.85 && close < m10;
          shouldExit = breakdownMA10TwoDays || breakdownMA20 || trailingStop || isClimaxSubside;
        } else if (maxGain >= 0.15) {
          // 【第二層：波段防衛與成長期】(15% <= maxGain <= 40%) - 縮短月線觀察期與底型防護
          const breakdownMA20 = (close < m20 && prevClose < m20) || (close < m20 && major3DaysNet < 0);
          const prev8Low = Math.min(...lows.slice(i-8, i));
          const structureBreak = close < prev8Low;
          shouldExit = breakdownMA20 || structureBreak || isClimaxSubside;
        } else {
          // 【第一層：底部洗盤期】(maxGain < 15%) - 容忍震盪，啟動防甩轎機制
          const breakdownMA20 = (close < m20 && prevClose < m20 && prev2Close < m20) || (close < m20 * 0.98 && (instToday.net < 0 || major3DaysNet < 0));
          const prev15Low = Math.min(...lows.slice(i-15, i));
          const structureBreak = close < prev15Low;
          shouldExit = breakdownMA20 || structureBreak || isClimaxSubside || strictStop;
        }
      }

      if (shouldExit) {
        markers.push({
          time: date as Time,
          position: 'aboveBar',
          color: '#ff9800', 
          shape: 'arrowDown',
          text: '平倉',
        });
        currentTrend = null;
        trendDuration = 0;
        lastAddIndex = 0;
        addCount = 0;
        continue;
      }

      // ----------------------------------------------------
      // 2. 加碼邏輯 (Add Signals) - 雙軌制加碼與優化
      // ----------------------------------------------------
      if (i - lastAddIndex >= 5 && trendDuration >= 5 && addCount < 2) {
        // 中期多頭排列為基礎底線
        const midTermBullish = m10 > m20;
        // 嚴格多頭排列 (指標突破時才需要)
        const strictBullishArray = m5 > m10 && m10 > m20;

        // 回測有撐條件 (Touch MA)
        const isTouchingMA = (low <= m10 * 1.015 && close >= m20 * 0.99);
        // K線防護：紅K 或 留下影線的洗盤K，避免接到長黑貫殺
        const isRedCandle = close >= openPrice;
        const hasLowerShadow = high > low && ((close - low) / (high - low) > 0.5);
        const validTouchMA = isTouchingMA && (isRedCandle || hasLowerShadow);

        // 指標轉強條件 (Indicator Synergy)
        // 限制 KD 在中低位階黃金交叉 (K < 75)
        const kdCross = k > d && kLine[i-1]! <= dLine[i-1]! && k < 75;
        // 限制 MACD 柱狀體必須大於 0 (已翻紅)
        const macdStrengthening = mh > prevMh && mh > 0;
        const validIndicator = strictBullishArray && kdCross && macdStrengthening;

        const dailyGain = prevClose > 0 ? (close - prevClose) / prevClose : 0;
        
        let instBuySupport = false;
        let safeBias = false;

        if (isLargeCap) {
          // 大型股加碼：著重外資與法人進駐
          instBuySupport = (instToday.netForeign > 0 || instToday.netTrust > 0) && major3DaysNet > 0;
          safeBias = bias20 < 0.10;
        } else {
          // 中小型股加碼：支援出量上漲
          instBuySupport = ((instToday.netForeign > 0 || instToday.netTrust > 0) && major3DaysNet > 0) || (vol / m20v > 1.5 && dailyGain > 0.02);
          safeBias = bias20 < 0.15;
        }

        // 觸發條件：中期多頭趨勢下，(有效回測有撐 OR 指標再度轉強) 且有買盤支撐且乖離安全
        if (midTermBullish && (validTouchMA || validIndicator) && instBuySupport && safeBias) {
          markers.push({
            time: date as Time,
            position: 'belowBar',
            color: '#2196F3',
            shape: 'arrowUp',
            text: '加碼',
          });
          lastAddIndex = i;
          addCount++;
        }
      }
    } else {
      // ----------------------------------------------------
      // 3. 啟動邏輯 (Entry Signals) - 雙軌制分流突破
      // ----------------------------------------------------
      // 專注於做多，不產生做空訊號。
      
      if (m20v >= 200000 && bias20 >= -0.05) {
        let score = 0;
        let baseVol = false;
        let baseBullish = false;
        let baseNearMA = false;
        let baseInst = false;
        
        let trustRatioDaily = 0;
        let foreignTrustRatioDaily = 0;
        let todayMajorNet = 0;

        if (ticker && ticker.issuedShares && ticker.issuedShares > 0) {
          trustRatioDaily = (instToday.netTrust / ticker.issuedShares) * 100;
          todayMajorNet = instToday.netForeign + instToday.netTrust + instToday.netDealer;
          foreignTrustRatioDaily = (todayMajorNet / ticker.issuedShares) * 100;
        } else {
          todayMajorNet = instToday.netForeign + instToday.netTrust + instToday.netDealer;
        }
        
        const macdSynergy = mh > 0 || (mh > prevMh && mh > -0.02);

        if (isLargeCap) {
          baseVol = m20v > 0 ? (m5v / m20v > 1.10 || vol / m20v > 1.15) : false;
          baseBullish = rsiVal > 40 && rsiVal < 82 && macdSynergy && k > d;
          baseNearMA = close > m20 && bias20 < 0.05;
          baseInst = (ticker && ticker.issuedShares && ticker.issuedShares > 0) 
            ? (trustRatioDaily > 0.015 || foreignTrustRatioDaily > 0.03) 
            : (todayMajorNet > 0);
        } else {
          baseVol = m20v > 0 ? ((m5v / m20v > 1.58) || (vol / m20v > 2.0)) : false;
          baseBullish = rsiVal > 40 && rsiVal < 86 && macdSynergy && k > d;
          const isBbOpening = bbW > prevBbW * 1.05 && close >= bbU * 0.99;
          baseNearMA = (close > m20 && bias20 < 0.08) || isBbOpening;
          baseInst = (ticker && ticker.issuedShares && ticker.issuedShares > 0)
            ? (trustRatioDaily > 0.03 || foreignTrustRatioDaily > 0.05)
            : (todayMajorNet > 0);
        }

        if (baseVol) score += 15;
        if (baseBullish) score += 15;
        if (baseNearMA) score += 15;
        if (baseInst) score += 15;

        // 3. 動能外卡加分 (最高 40分)
        const volRatio = m20v > 0 ? (vol / m20v) : 1;
        score += Math.min(15, Math.max(0, (volRatio - 1) * 10)); // 爆量加分
        
        if (trustRatioDaily > 0) score += Math.min(10, trustRatioDaily * 100);
        if (instToday.netTrust > 0 && instToday.netForeign > 0 && ticker && ticker.issuedShares && ticker.issuedShares > 0) {
            score += 5; // 內外資聯手
        }

        if (rsiVal >= 55 && rsiVal <= 80) {
            score += Math.min(10, (rsiVal - 55) * (10 / 25)); // 動能加分
        }

        score = Math.min(100, score); // 鎖定最高 100 分

        if (score >= 60) {
          markers.push({
            time: date as Time,
            position: 'belowBar',
            color: '#e91e63',
            shape: 'arrowUp',
            text: `啟動(${Math.round(score)})`,
          });
          currentTrend = 'long';
          trendDuration = 0;
          startPrice = close;
          highestPrice = high;
          lastAddIndex = i;
          addCount = 0;
        }
      }
    }
  }

  return markers;
};

const calculateStrategy2 = (
  candles: StockCandle[],
  _institutional: InstitutionalData[],
  _ticker: StockTicker | null = null,
  _financials?: ComprehensiveFinancials
): SeriesMarker<Time>[] => {
  if (candles.length < 60) return [];

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const dates = candles.map(c => c.date);

  // 1. Calculate Technical Indicators
  const ma5 = padData(closes, SMA.calculate({ period: 5, values: closes }));
  const ma10 = padData(closes, SMA.calculate({ period: 10, values: closes }));
  const ma20 = padData(closes, SMA.calculate({ period: 20, values: closes }));
  const ma5Vol = padData(volumes, SMA.calculate({ period: 5, values: volumes }));

  const bbRaw = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const bbUpper = padData(closes, bbRaw.map(b => b.upper));

  const macdRaw = MACD.calculate({ 
    values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, 
    SimpleMAOscillator: false, SimpleMASignal: false 
  });
  const diffMacd = closes.length - macdRaw.length;
  const macdHist = new Array(diffMacd).fill(null).concat(macdRaw.map(m => m.histogram));

  const adxRaw = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const diffAdx = closes.length - adxRaw.length;
  const adx = new Array(diffAdx).fill(null).concat(adxRaw.map(a => a.adx));
  const pdi = new Array(diffAdx).fill(null).concat(adxRaw.map(a => a.pdi));
  const mdi = new Array(diffAdx).fill(null).concat(adxRaw.map(a => a.mdi));

  const markers: SeriesMarker<Time>[] = [];
  
  // State variables
  let isInWatchlist = false;
  let watchCountdown = 0;
  let anchorLow = 0;
  let positionState = 0; // 0, 1, 2, 3
  let entryPrice1 = 0;
  let daysBelow10MA = 0;

  for (let i = 60; i < candles.length; i++) {
    const date = dates[i];
    const close = closes[i];
    const low = lows[i];
    const vol = volumes[i];

    const m5 = ma5[i] ?? 0;
    const m10 = ma10[i] ?? 0;
    const m20 = ma20[i] ?? 0;
    const isBullishMA = m5 > m10 && m10 > m20;
    const m5v = ma5Vol[i] ?? 0;
    const bbu = bbUpper[i] ?? 0;
    const currentPdi = pdi[i] ?? 0;
    const currentMdi = mdi[i] ?? 0;
    const currentAdx = adx[i] ?? 0;
    const prevAdx = adx[i-1] ?? 0;

    // --- Module 3: Structural Defense & Exit ---
    if (positionState > 0) {
      let shouldExit = false;

      // Update Time Delay Filter
      if (close < m10) {
        daysBelow10MA += 1;
      } else {
        daysBelow10MA = 0;
      }

      // Defense Mechanism A (Only first tier)
      if (positionState === 1 && close < anchorLow) {
        shouldExit = true;
      }
      // Defense Mechanism B (Second tier or fully loaded)
      else if (positionState >= 2 && daysBelow10MA >= 4) {
        shouldExit = true;
      }

      if (shouldExit) {
        markers.push({
          time: date as Time,
          position: 'aboveBar',
          color: '#ff9800',
          shape: 'arrowDown',
          text: '平倉',
        });
        positionState = 0;
        isInWatchlist = false;
        continue;
      }
    }

    // --- Module 1: Radar Monitoring (Watchlist) ---
    if (positionState === 0 && !isInWatchlist) {
      const hasRecentMacdPositive = macdHist.slice(i-5, i+1).some(h => h !== null && h > 0);
      const isBreakout = close > bbu && vol > m5v * 1.5 && currentPdi > currentMdi && hasRecentMacdPositive;

      if (isBreakout) {
        isInWatchlist = true;
        anchorLow = low;
        watchCountdown = 8;
        markers.push({
          time: date as Time,
          position: 'aboveBar',
          color: '#9C27B0',
          shape: 'circle',
          text: '監控',
        });
        continue; // Wait for the next day to potentially enter
      }
    }

    // Update Watchlist Countdown
    if (isInWatchlist && positionState === 0) {
      if (watchCountdown > 0) {
        watchCountdown -= 1;
      } else {
        isInWatchlist = false; // Expired
      }
    }

    // --- Module 2: Capital Entry (State Transitions) ---
    if (isInWatchlist) {
      if (positionState === 0 && watchCountdown > 0) {
        // State 0 -> 1: First tier (Pullback to near 5MA)
        const isNear5MA = Math.abs(close - m5) / m5 <= 0.02;

        if (isNear5MA && isBullishMA) {
          markers.push({
            time: date as Time,
            position: 'belowBar',
            color: '#e91e63',
            shape: 'arrowUp',
            text: '建倉(1)',
          });
          positionState = 1;
          entryPrice1 = close;
        }
      } else if (positionState === 1) {
        // State 1 -> 2: Second tier (Trend confirmation)
        const isProfitable = close > entryPrice1;
        const isAdxStrong = currentAdx > 20 && currentAdx > prevAdx;

        if (isProfitable && isAdxStrong && isBullishMA) {
          markers.push({
            time: date as Time,
            position: 'belowBar',
            color: '#2196F3',
            shape: 'arrowUp',
            text: '加碼(2)',
          });
          positionState = 2;
        }
      } else if (positionState === 2) {
        // State 2 -> 3: Third tier (Structure breakout)
        const recent10Highs = highs.slice(i-10, i);
        const max10High = recent10Highs.length > 0 ? Math.max(...recent10Highs) : 0;
        
        if (close > max10High && isBullishMA) {
          markers.push({
            time: date as Time,
            position: 'belowBar',
            color: '#4CAF50',
            shape: 'arrowUp',
            text: '滿倉(3)',
          });
          positionState = 3;
        }
      }
    }
  }

  return markers;
};

export const calculateSignals = (
  strategyId: string,
  candles: StockCandle[],
  institutional: InstitutionalData[],
  ticker: StockTicker | null = null,
  financials?: ComprehensiveFinancials
): SeriesMarker<Time>[] => {
  switch (strategyId) {
    case 'trend_v1':
      return calculateTrendStrategy(candles, institutional, ticker, financials);
    case 'strategy_2':
      return calculateStrategy2(candles, institutional, ticker, financials);
    default:
      return calculateTrendStrategy(candles, institutional, ticker, financials);
  }
};

// ============================================================================
// 大盤低頻大波段動態槓桿策略 (0050 正二現股 + 現金 + 正二融資：買支撐、賣高乖離)
// ============================================================================

export type MarketStrategyMode = 'advanced_3x' | 'steady_2_5x' | 'off';

export interface MarketSignalEvent {
  date: string;
  fromExposure: number;
  toExposure: number;
  signalText: string;
  color: string;
  isBuy: boolean;
  reason: string;
  close: number;
  score: number;
  bias20Pct: number;
}

export interface MarketPositionStatus {
  exposure: number;
  tierName: string;
  allocationText: string;
  altAllocationText: string;
  spot2xPct: number;
  margin2xPct: number;
  cashPct: number;
  lastSignalText: string;
  lastSignalDate: string;
  lastSignalReason: string;
  ma20: number;
  bias20Pct: number;
  scoreMa3: number;
  scoreMa5: number;
}

export interface MarketStrategyResult {
  markers: SeriesMarker<Time>[];
  currentPosition: MarketPositionStatus;
  events: MarketSignalEvent[];
}

export const getMarketTierInfo = (exposure: number, mode: MarketStrategyMode = 'advanced_3x') => {
  if (exposure >= 2.5) {
    const is3x = mode === 'advanced_3x' || exposure >= 3.0;
    return {
      tierName: is3x ? '3.0x 主升滿倉檔' : '2.5x 主升穩健檔',
      allocationText: is3x
        ? '67% 0050正二現股 + 33% 自備款正二融資'
        : '83% 0050正二現股 + 17% 自備款正二融資',
      altAllocationText: is3x
        ? '總持倉為本金 150% 之正二市值 (整戶維持率 250%)'
        : '總持倉為本金 125% 之正二市值 (整戶維持率 357%)',
      spot2xPct: is3x ? 67 : 83,
      margin2xPct: is3x ? 33 : 17,
      cashPct: 0,
    };
  }
  if (exposure === 2.0) {
    return {
      tierName: '2.0x 波段主力檔',
      allocationText: '100% 0050正二現股 (0 融資)',
      altAllocationText: '全倉持有正二現股抱波段，等效 200% 大盤曝險',
      spot2xPct: 100,
      margin2xPct: 0,
      cashPct: 0,
    };
  }
  if (exposure === 1.0) {
    return {
      tierName: '1.0x 基礎試單 / 防守檔',
      allocationText: '50% 0050正二現股 + 50% 現金',
      altAllocationText: '或 100% 0050現股 (保留一半現金防震盪)',
      spot2xPct: 50,
      margin2xPct: 0,
      cashPct: 50,
    };
  }
  return {
    tierName: '0x 空手避險檔',
    allocationText: '100% 現金 (空手觀望)',
    altAllocationText: '全數資金退場避險，等待站上月線起漲或破底翻訊號',
    spot2xPct: 0,
    margin2xPct: 0,
    cashPct: 100,
  };
};

export const calculateMarketStrategySignals = (
  records: MarketDailyRecord[],
  mode: MarketStrategyMode = 'advanced_3x'
): MarketStrategyResult => {
  const defaultTier = getMarketTierInfo(0, mode);
  if (!records || records.length === 0) {
    return {
      markers: [],
      currentPosition: {
        exposure: 0,
        ...defaultTier,
        lastSignalText: '無資料',
        lastSignalDate: '-',
        lastSignalReason: '-',
        ma20: 0,
        bias20Pct: 0,
        scoreMa3: 50,
        scoreMa5: 50,
      },
      events: [],
    };
  }

  const maxLev = mode === 'steady_2_5x' ? 2.5 : 3.0;
  const markers: SeriesMarker<Time>[] = [];
  const events: MarketSignalEvent[] = [];

  let curExposure = 0;
  let lastSignalText = 'Sell All';
  let lastSignalDate = records[0].date;
  let lastSignalReason = '初始空手狀態';
  let lastChangeIdx = 0;
  let isLeftBottomHold = false;
  let bottomLow = 0;

  // Precompute MA5, MA20, Score_MA3, Score_MA5 across all records
  const ma5List: number[] = [];
  const ma20List: number[] = [];
  const scoreMa3List: number[] = [];
  const scoreMa5List: number[] = [];

  for (let i = 0; i < records.length; i++) {
    if (records[i].ma5 && records[i].ma5! > 0) {
      ma5List.push(records[i].ma5!);
    } else {
      const slice5 = records.slice(Math.max(0, i - 4), i + 1);
      ma5List.push(slice5.reduce((sum, r) => sum + r.close, 0) / slice5.length);
    }

    if (records[i].ma20 && records[i].ma20! > 0) {
      ma20List.push(records[i].ma20!);
    } else {
      const slice20 = records.slice(Math.max(0, i - 19), i + 1);
      ma20List.push(slice20.reduce((sum, r) => sum + r.close, 0) / slice20.length);
    }

    const slice3 = records.slice(Math.max(0, i - 2), i + 1);
    scoreMa3List.push(slice3.reduce((sum, r) => sum + r.score, 0) / slice3.length);

    const sliceS5 = records.slice(Math.max(0, i - 4), i + 1);
    scoreMa5List.push(sliceS5.reduce((sum, r) => sum + r.score, 0) / sliceS5.length);
  }

  for (let i = 2; i < records.length; i++) {
    const today = records[i];
    const prev = records[i - 1];
    const prev2 = records[i - 2];

    const ma5 = ma5List[i];
    const ma20 = ma20List[i];
    const prevMa20 = ma20List[i - 1];
    const prev2Ma20 = ma20List[i - 2];
    const scoreMa3 = scoreMa3List[i];
    const scoreMa5 = scoreMa5List[i];

    const bias20 = ma20 > 0 ? (today.close - ma20) / ma20 : 0;
    const bias20Pct = Number((bias20 * 100).toFixed(2));
    const daysSinceChange = i - lastChangeIdx;

    // 若原本為左側破底翻試單，一旦收盤正式站上月線 MA20，即轉為正常右側波段持倉
    if (isLeftBottomHold && today.close >= ma20) {
      isLeftBottomHold = false;
    }

    const belowMa20_2d = today.close < ma20 && prev.close < prevMa20;
    const belowMa20_3d = belowMa20_2d && prev2.close < prev2Ma20;

    let targetExposure = curExposure;
    let reason = '';
    let isLeftSideBottom = false;

    // ------------------------------------------------------------------------
    // 1. 趨勢破位清倉 (➔ 0x Sell All)：連續跌破月線 + 5日均分轉空，過濾單日洗盤
    // ------------------------------------------------------------------------
    if (curExposure > 0) {
      if (isLeftBottomHold) {
        if (today.close < bottomLow || (daysSinceChange >= 2 && today.score <= 28)) {
          targetExposure = 0;
          isLeftBottomHold = false;
          reason = '左側抄底跌破前低停損線，退回 100% 現金 (0x)';
        }
      } else if (
        (belowMa20_2d && scoreMa5 < 42) ||
        (belowMa20_3d && scoreMa5 < 45) ||
        (today.close < ma20 * 0.975 && scoreMa3 < 40)
      ) {
        targetExposure = 0;
        reason = `連續跌破月線 MA20 且 5日均分轉空 (${scoreMa5.toFixed(1)}分)，波段趨勢結束清倉 (0x)`;
      }
    }

    // ------------------------------------------------------------------------
    // 2. 高檔正乖離過大「逢高獲利了結融資」 (3x ➔ 2x Sell x2)：真正賣在波段高點！
    // ------------------------------------------------------------------------
    if (targetExposure === curExposure && curExposure >= 2.5 && daysSinceChange >= 4) {
      if (bias20 >= 0.055 && (today.score < 68 || today.close < today.open)) {
        targetExposure = 2.0;
        reason = `月線正乖離過大 (+${bias20Pct}%) 且短線轉弱，逢高獲利了結融資，保留 100% 正二現股 (2x)`;
      }
    }

    // ------------------------------------------------------------------------
    // 3. 跌破月線整理降檔防守 (>1x ➔ 1x Sell x1)：連兩日破月線但均分尚未崩壞
    // ------------------------------------------------------------------------
    if (targetExposure === curExposure && curExposure > 1.0 && daysSinceChange >= 4) {
      if (belowMa20_2d && scoreMa5 >= 42 && scoreMa5 < 48) {
        targetExposure = 1.0;
        reason = `連續兩日跌破月線 MA20 (5日均分 ${scoreMa5.toFixed(1)})，退掉槓桿降回 1x 基本倉防守`;
      }
    }

    // ------------------------------------------------------------------------
    // 4. 空手波段起漲建倉 (0x ➔ 2x 或 1x)：買在剛站上月線起漲點或左側破底翻！
    // ------------------------------------------------------------------------
    if (targetExposure === curExposure && curExposure === 0) {
      const leftBottom =
        bias20 <= -0.02 &&
        (prev.score <= 30 || prev2.score <= 30) &&
        today.score - prev.score >= 15 &&
        today.marginDiff <= 0 &&
        today.close >= ma5;

      if (leftBottom) {
        targetExposure = 1.0;
        isLeftSideBottom = true;
        isLeftBottomHold = true;
        bottomLow = Math.min(today.low, prev.low, prev2.low) * 0.995;
        reason = `極度恐慌後急彈 +${today.score - prev.score}分、融資減少且站上5日線，左側破底翻抄底 (1x)`;
      } else if (today.close >= ma20 && scoreMa5 >= 53) {
        isLeftBottomHold = false;
        if (bias20 <= 0.035) {
          targetExposure = 2.0;
          reason = `初站上月線起漲點 (乖離僅 +${bias20Pct}%) 且 5日均分翻多 (${scoreMa5.toFixed(1)})，直接建倉全倉正二 (2x)`;
        } else {
          targetExposure = 1.0;
          reason = `站上月線且 5日均分翻多 (${scoreMa5.toFixed(1)})，因乖離較大 (+${bias20Pct}%) 先建基本倉 (1x)`;
        }
      }
    }

    // ------------------------------------------------------------------------
    // 5. 基本倉確認站穩月線升檔 (1x ➔ 2x Buy x2)：低乖離確認多頭升至全倉正二
    // ------------------------------------------------------------------------
    if (targetExposure === curExposure && curExposure === 1.0 && daysSinceChange >= 3) {
      if (today.close >= ma20 && scoreMa5 >= 53 && bias20 <= 0.04) {
        targetExposure = 2.0;
        isLeftBottomHold = false;
        reason = `站穩月線且乖離適中 (+${bias20Pct}%)、5日均分 ${scoreMa5.toFixed(1)}，升檔至全倉正二 (2x)`;
      }
    }

    // ------------------------------------------------------------------------
    // 6. 多頭回測月線支撐「逢低加碼融資」 (➔ 3x / 2.5x)：絕不在大漲高點追價！
    // ------------------------------------------------------------------------
    if (
      targetExposure === curExposure &&
      (curExposure === 1.0 || curExposure === 2.0) &&
      daysSinceChange >= 3
    ) {
      const isBullTrend = ma20 >= prevMa20 && scoreMa5 >= 56;
      const isNearMa20Support = bias20 >= -0.005 && bias20 <= 0.022 && today.close >= ma20;
      const isBounceRed = today.close > today.open && today.score >= 60;

      if (isBullTrend && isNearMa20Support && isBounceRed) {
        targetExposure = maxLev;
        isLeftBottomHold = false;
        reason = `多頭趨勢回測月線支撐低位階 (乖離僅 +${bias20Pct}%) 收紅止跌，逢低加碼正二融資 (${maxLev}x)`;
      }
    }

    if (targetExposure !== curExposure) {
      const isBuy = targetExposure > curExposure;
      let signalText = '';
      let color = '';

      if (isBuy) {
        if (targetExposure === 1.0) {
          signalText = isLeftSideBottom ? 'Buy x1(底)' : 'Buy x1';
          color = '#ec4899'; // pink-500
        } else if (targetExposure === 2.0) {
          signalText = 'Buy x2';
          color = '#ef4444'; // red-500
        } else {
          signalText = targetExposure === 3.0 ? 'Buy x3' : 'Buy x2.5';
          color = '#a855f7'; // purple-500
        }
      } else {
        if (targetExposure === 2.0) {
          signalText = 'Sell x2(高檔鎖利)';
          color = '#f59e0b'; // amber-500
        } else if (targetExposure === 1.0) {
          signalText = 'Sell x1';
          color = '#06b6d4'; // cyan-500
        } else {
          signalText = 'Sell All';
          color = '#10b981'; // emerald-500
        }
      }

      if (mode !== 'off') {
        markers.push({
          time: today.date as Time,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color,
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: signalText,
        });
      }

      events.push({
        date: today.date,
        fromExposure: curExposure,
        toExposure: targetExposure,
        signalText,
        color,
        isBuy,
        reason,
        close: today.close,
        score: today.score,
        bias20Pct,
      });

      curExposure = targetExposure;
      lastSignalText = signalText;
      lastSignalDate = today.date;
      lastSignalReason = reason;
      lastChangeIdx = i;
    }
  }

  const lastIdx = records.length - 1;
  const lastMa20 = ma20List[lastIdx] || 0;
  const lastBias20Pct =
    lastMa20 > 0 ? Number((((records[lastIdx].close - lastMa20) / lastMa20) * 100).toFixed(2)) : 0;
  const tierInfo = getMarketTierInfo(curExposure, mode);

  return {
    markers,
    currentPosition: {
      exposure: curExposure,
      ...tierInfo,
      lastSignalText,
      lastSignalDate,
      lastSignalReason,
      ma20: lastMa20,
      bias20Pct: lastBias20Pct,
      scoreMa3: scoreMa3List[lastIdx] || 50,
      scoreMa5: scoreMa5List[lastIdx] || 50,
    },
    events,
  };
};
