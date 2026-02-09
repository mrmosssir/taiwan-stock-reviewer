import { SMA, MACD, Stochastic, BollingerBands, RSI } from 'technicalindicators';
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
  const dates = candles.map(c => c.date);

  // 1. Calculate Technical Indicators
  const ma5 = padData(closes, SMA.calculate({ period: 5, values: closes }));
  const ma10 = padData(closes, SMA.calculate({ period: 10, values: closes }));
  const ma20 = padData(closes, SMA.calculate({ period: 20, values: closes }));
  const ma60 = padData(closes, SMA.calculate({ period: 60, values: closes }));

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

  const bbRaw = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const bbUpper = padData(closes, bbRaw.map(b => b.upper));
  // Bandwidth = (Upper - Lower) / Middle
  const bbWidth = padData(closes, bbRaw.map(b => (b.upper - b.lower) / b.middle));

  const rsiRaw = RSI.calculate({ period: 14, values: closes });
  const rsi = padData(closes, rsiRaw);

  // 2. Align Chip Data
  const instMap = new Map(institutional.map(i => [normalizeDate(i.date), i]));

  const markers: SeriesMarker<Time>[] = [];
  let currentTrend: TrendState = null;
  let trendDuration = 0;
  let startPrice = 0;
  let highestPrice = 0;
  let rsiAtHighestPrice = 0;

  // 3. Iterate and Check Conditions
  for (let i = 60; i < candles.length; i++) {
    const date = dates[i];

    const close = closes[i];
    const open = candles[i].open;
    const prevClose = closes[i-1];
    const high = highs[i];
    const low = lows[i];
    
    // Indicators
    const m5 = ma5[i] ?? 0;
    const m10 = ma10[i] ?? 0;
    const m20 = ma20[i] ?? 0;
    const m60 = ma60[i] ?? 0;
    const mh = macdHist[i] ?? 0;
    const k = kLine[i] ?? 0;
    const d = dLine[i] ?? 0;
    
    const bbU = bbUpper[i] ?? 0;
    const bbW = bbWidth[i] ?? 0;
    const prevBbW = bbWidth[i-1] ?? 0;
    const rsiVal = rsi[i] ?? 50;

    // Chip Data Helper
    const getInst = (offset: number) => {
      if (i - offset < 0) return { net: 0, netTrust: 0 };
      return instMap.get(normalizeDate(dates[i - offset])) || { net: 0, netTrust: 0 };
    };

    const instData = getInst(0);
    const instNet = instData.net; // Total net (Foreign + Trust + Dealer)

    // --- State Machine Logic ---
    if (currentTrend) {
      trendDuration++;
      if (currentTrend === 'long') {
        if (high > highestPrice) {
          highestPrice = high;
          rsiAtHighestPrice = rsiVal;
        }
      } else if (currentTrend === 'short') {
        highestPrice = Math.min(highestPrice, low); 
      }
    }

    // 1. Check for Trend Switching (Exit or Reverse)
    if (currentTrend === 'long') {
      const gain = (close - startPrice) / startPrice;
      const isHighProfit = gain > 0.4;
      const isGracePeriod = trendDuration <= 6;
      
      const strictExit = close < m60 * 0.97;
      
      // Standard Exit: Break MA20 + Inst Sell
      // Power Up: Break 20-day Low (Structure Break)
      const prev20Low = Math.min(...lows.slice(i-20, i));
      const structureBreak = close < prev20Low;
      const normalExit = (close < m20 && instNet < 0) || structureBreak;
      
      // High Profit Exit (>40%): 
      // 1. Break MA10 
      // 2. Big Black Candle (>7% drop)
      // 3. Peak Pullback > 10%
      // 4. Power Up: RSI Divergence (Price near high, RSI < 70 OR RSI Drop from Overbought)
      //    Simple check: If we were overbought (>80) and now dropped below 70
      //    Or: Current High vs RSI check.
      //    Let's use: RSI < 70 AND HighestPrice was created when RSI > 75 (Momentum lost)
      const rsiDivergence = isHighProfit && (rsiVal < 70 && rsiAtHighestPrice > 75 && close < highestPrice * 0.95);
      
      const bigBlackK = (open - close) / open > 0.07;
      const peakPullback = (highestPrice - close) / highestPrice > 0.1;
      
      const highProfitExit = isHighProfit && (close < m10 || bigBlackK || peakPullback || rsiDivergence);

      // Stop Loss (Dynamic): If we entered on "Break High" or "BB Open", we might want tighter stop.
      // For now, stick to standard.

      if ((isGracePeriod && strictExit) || (!isGracePeriod && (normalExit || highProfitExit))) {
        let exitReason = '平多';
        if (highProfitExit) {
          if (rsiDivergence) exitReason = 'RSI背離止盈';
          else if (bigBlackK) exitReason = '長黑止盈';
          else if (peakPullback) exitReason = '高點回落止盈';
          else exitReason = '高獲利保護';
        } else if (structureBreak) {
          exitReason = '破前低止損';
        }

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
      // Simple Short Exit
      const isGracePeriod = trendDuration <= 6;
      const strictExit = close > m60 * 1.03;
      const normalExit = close > m20 && instNet > 0;

      if ((isGracePeriod && strictExit) || (!isGracePeriod && normalExit)) {
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
      // Base: Close > MA20 AND MACD > 0
      const baseCondition = close > m20 && prevClose <= m20 && mh > 0;

      // Power Up Triggers:
      // 1. TouXin Consecutive Buy (3 days)
      const touXinBuy = getInst(0).netTrust > 0 && getInst(1).netTrust > 0 && getInst(2).netTrust > 0;
      
      // 2. BB Opening: Bandwidth expanded > 10% vs yesterday AND Close > Upper Band
      const bbOpening = bbW > prevBbW * 1.1 && close > bbU;
      
      // 3. Break Previous High (20 days)
      const prev20High = Math.max(...highs.slice(i-20, i));
      const breakHigh = close > prev20High;
      
      // Original Trigger fallback: InstNet > 0 OR Vol > 1.2 * MA5Vol
      // We keep TouXin as strong signal.
      
      const strongSignal = touXinBuy || bbOpening || breakHigh;
      
      // Entry
      if (baseCondition && strongSignal) {
        let reason = '做多啟動';
        if (touXinBuy) reason += '(投信)';
        if (bbOpening) reason += '(布林開口)';
        if (breakHigh) reason += '(破前高)';

        markers.push({
          time: date as Time,
          position: 'belowBar',
          color: '#e91e63',
          shape: 'arrowUp',
          text: reason,
        });
        currentTrend = 'long';
        trendDuration = 0;
        startPrice = close;
        highestPrice = high;
        rsiAtHighestPrice = rsiVal;
        continue;
      }
    }

    if (currentTrend !== 'short') {
      const shortStart = (close < m20 && prevClose >= m20) && (mh < 0 || k < d) && (instNet < 0);
      if (shortStart) {
        markers.push({
          time: date as Time,
          position: 'aboveBar',
          color: '#4caf50',
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
      
      // Power Up: Bias Check (乖離率)
      // Bias = (Close - MA20) / MA20. Should be < 5% (0.05) to add.
      const bias = (close - m20) / m20;
      const safeBias = bias < 0.05;

      if (bullishArray && touchMa20 && instNet >= 0 && safeBias) {
        markers.push({
          time: date as Time,
          position: 'belowBar',
          color: '#2196F3',
          shape: 'arrowUp',
          text: '多方加碼',
        });
      }
    } else if (currentTrend === 'short') {
      // Short Add
    }
  }

  return markers;
};
