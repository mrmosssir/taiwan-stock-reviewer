import { SMA, MACD, Stochastic } from 'technicalindicators';
import type { StockCandle, InstitutionalData } from '../api';
import type { SeriesMarker, Time } from 'lightweight-charts';

// Helper to pad results to match input length
const padData = (input: number[], result: number[]): (number | null)[] => {
  const diff = input.length - result.length;
  const padded = new Array(diff).fill(null);
  return [...padded, ...result];
};

// Helper to normalize date string to YYYY-MM-DD
const normalizeDate = (d: string) => d.split('T')[0].replace(/\//g, '-');

type TrendState = 'long' | 'short' | null;

export const calculateSignals = (
  candles: StockCandle[],
  institutional: InstitutionalData[]
): SeriesMarker<Time>[] => {
  if (candles.length < 60) {
    return [];
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const dates = candles.map(c => c.date);

  // 1. Calculate Technical Indicators
  const ma5 = padData(closes, SMA.calculate({ period: 5, values: closes }));
  const ma10 = padData(closes, SMA.calculate({ period: 10, values: closes }));
  const ma20 = padData(closes, SMA.calculate({ period: 20, values: closes }));
  const ma60 = padData(closes, SMA.calculate({ period: 60, values: closes }));
  const ma5Vol = padData(volumes, SMA.calculate({ period: 5, values: volumes }));

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

  // 2. Align Chip Data
  const instMap = new Map(institutional.map(i => [normalizeDate(i.date), i.net]));

  const markers: SeriesMarker<Time>[] = [];
  let currentTrend: TrendState = null;
  let trendDuration = 0;
  let startPrice = 0;
  let highestPrice = 0;

  // 3. Iterate and Check Conditions
  for (let i = 60; i < candles.length; i++) {
    const date = dates[i];
    const normalizedDate = normalizeDate(date);

    const close = closes[i];
    const open = candles[i].open;
    const prevClose = closes[i-1];
    const high = highs[i];
    const low = lows[i];
    const vol = volumes[i];
    
    // Indicators
    const m5 = ma5[i] ?? 0;
    const m10 = ma10[i] ?? 0;
    const m20 = ma20[i] ?? 0;
    const m60 = ma60[i] ?? 0;
    const m5v = ma5Vol[i] ?? 0;
    const mh = macdHist[i] ?? 0;
    const k = kLine[i] ?? 0;
    const d = dLine[i] ?? 0;

    // Chip Data
    const instNet = instMap.get(normalizedDate) ?? 0;

    // --- State Machine Logic ---
    if (currentTrend) {
      trendDuration++;
      if (currentTrend === 'long') {
        highestPrice = Math.max(highestPrice, high);
      } else if (currentTrend === 'short') {
        highestPrice = Math.min(highestPrice, low); // Uses highestPrice to store lowest for short
      }
    }

    // 1. Check for Trend Switching (Exit or Reverse)
    if (currentTrend === 'long') {
      const gain = (close - startPrice) / startPrice;
      const isHighProfit = gain > 0.4;
      const isGracePeriod = trendDuration <= 6;
      
      const strictExit = close < m60 * 0.97;
      
      // Standard Exit (Normal growth)
      const normalExit = close < m20 && instNet < 0;
      
      // High Profit Exit (Tighter): 
      // 1. Break MA10 (don't wait for MA20)
      // 2. Big Black Candle (>8% drop in body)
      // 3. Pullback from peak > 10%
      const bigBlackK = (open - close) / open > 0.08;
      const peakPullback = (highestPrice - close) / highestPrice > 0.1;
      const highProfitExit = isHighProfit && (close < m10 || bigBlackK || peakPullback);

      if ((isGracePeriod && strictExit) || (!isGracePeriod && (normalExit || highProfitExit))) {
        const exitReason = highProfitExit ? '利多平倉' : '平多';
        console.log(`[Signal Exit Long] Date: ${date}, Reason: ${exitReason}, Gain: ${(gain*100).toFixed(1)}%`);
        
        markers.push({
          time: date as Time,
          position: 'aboveBar',
          color: '#ff9800', 
          shape: 'arrowDown',
          text: exitReason,
        });
        currentTrend = null;
        trendDuration = 0;
      }
    } else if (currentTrend === 'short') {
      // Exit condition for Short
      const isGracePeriod = trendDuration <= 6;
      const strictExit = close > m60 * 1.03; // Relaxed
      const normalExit = close > m20 && instNet > 0;

      if ((isGracePeriod && strictExit) || (!isGracePeriod && normalExit)) {
        console.log(`[Signal Exit Short] Date: ${date}, Duration: ${trendDuration}, Close: ${close}, MA60: ${m60}, MA20: ${m20}, Inst: ${instNet}`);
        
        markers.push({
          time: date as Time,
          position: 'belowBar',
          color: '#ff9800',
          shape: 'arrowUp',
          text: '平空',
        });
        currentTrend = null;
        trendDuration = 0;
      }
    }

    // 2. Check for Start Signals (Only if not already in that trend)
    if (currentTrend !== 'long') {
      const longStart = (close > m20 && prevClose <= m20) && (mh > 0 || k > d) && (instNet > 0 || vol > 1.2 * m5v);
      if (longStart) {
        markers.push({
          time: date as Time,
          position: 'belowBar',
          color: '#e91e63', // Pink
          shape: 'arrowUp',
          text: '做多啟動',
        });
        currentTrend = 'long';
        trendDuration = 0;
        startPrice = close;
        highestPrice = high;
        continue; // Don't add on the same day as start
      }
    }

    if (currentTrend !== 'short') {
      const shortStart = (close < m20 && prevClose >= m20) && (mh < 0 || k < d) && (instNet < 0);
      if (shortStart) {
        markers.push({
          time: date as Time,
          position: 'aboveBar',
          color: '#4caf50', // Green
          shape: 'arrowDown',
          text: '做空啟動',
        });
        currentTrend = 'short';
        trendDuration = 0;
        startPrice = close;
        highestPrice = low;
        continue;
      }
    }

    // 3. Check for Add Signals (Only if in trend)
    if (currentTrend === 'long') {
      const bullishArray = m5 > m10 && m10 > m20;
      const touchMa20 = low <= m20 * 1.02 && close >= m20 * 0.98;
      if (bullishArray && touchMa20 && instNet >= 0) {
        markers.push({
          time: date as Time,
          position: 'belowBar',
          color: '#2196F3', // Blue
          shape: 'arrowUp',
          text: '多方加碼',
        });
      }
    } else if (currentTrend === 'short') {
      const bearishArray = m5 < m10 && m10 < m20;
      const bounceToMa20 = high >= m20 * 0.98 && close <= m20 * 1.02;
      if (bearishArray && bounceToMa20 && instNet <= 0) {
        markers.push({
          time: date as Time,
          position: 'aboveBar',
          color: '#8bc34a', // Light Green
          shape: 'arrowDown',
          text: '空方加碼',
        });
      }
    }
  }

  return markers;
};
