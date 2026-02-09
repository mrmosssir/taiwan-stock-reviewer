import { SMA, MACD, Stochastic, BollingerBands, RSI, ATR } from 'technicalindicators';
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
  
  // Volume MA for filters
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

  // Bollinger Bands
  const bbRaw = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const bbUpper = padData(closes, bbRaw.map(b => b.upper));
  const bbWidth = padData(closes, bbRaw.map(b => (b.upper - b.lower) / b.middle));

  // RSI
  const rsiRaw = RSI.calculate({ period: 14, values: closes });
  const rsi = padData(closes, rsiRaw);

  // NEW: ATR (Average True Range) for Dynamic Stops
  const atrRaw = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
  const atr = padData(closes, atrRaw);

  // 2. Align Chip Data
  const instMap = new Map(institutional.map(i => [normalizeDate(i.date), i]));

  const markers: SeriesMarker<Time>[] = [];
  let currentTrend: TrendState = null;
  let trendDuration = 0;
  let startPrice = 0;
  let highestPrice = 0; 
  let lowestPrice = 0; 
  let rsiAtHighestPrice = 0;

  // 3. Iterate and Check Conditions
  for (let i = 60; i < candles.length; i++) {
    const date = dates[i];

    const close = closes[i];
    const openPrice = candles[i].open;
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
    
    const bbU = bbUpper[i] ?? 0;
    const bbW = bbWidth[i] ?? 0;
    const prevBbW = bbWidth[i-1] ?? 0;
    const rsiVal = rsi[i] ?? 50;
    const atrVal = atr[i] ?? 0;

    // Helper: Calculate MA60 Slope
    const m60Prev5 = ma60[i-5] ?? m60;
    const isMa60Rising = m60 > m60Prev5 * 1.005; 

    // Chip Data Helper
    const getInst = (offset: number) => {
      if (i - offset < 0) return { net: 0, netTrust: 0 };
      return instMap.get(normalizeDate(dates[i - offset])) || { net: 0, netTrust: 0 };
    };

    const instData = getInst(0);
    const instNet = instData.net;

    // Helper: Bias calculation
    const bias20 = m20 > 0 ? (close - m20) / m20 : 0;

    // --- State Machine Logic ---
    if (currentTrend) {
      trendDuration++;
      if (currentTrend === 'long') {
        if (high > highestPrice) {
          highestPrice = high;
          rsiAtHighestPrice = rsiVal;
        }
      } else if (currentTrend === 'short') {
        if (low < lowestPrice || lowestPrice === 0) {
          lowestPrice = low;
        }
      }
    }

    // 1. Check for Trend Switching (Exit or Reverse)
    if (currentTrend === 'long') {
      const gain = (close - startPrice) / startPrice;
      const isHighProfit = gain > 0.4;
      const isGracePeriod = trendDuration <= 6;
      
      const chandelierStop = highestPrice - (3.0 * atrVal);
      const hitTrailingStop = close < chandelierStop;

      const prev20Low = Math.min(...lows.slice(i-20, i));
      const structureBreak = close < prev20Low;
      
      const normalExit = (close < m20 && instNet < 0);
      
      const rsiDivergence = isHighProfit && (rsiVal < 70 && rsiAtHighestPrice > 75 && close < highestPrice * 0.97);
      const highProfitExit = isHighProfit && (close < m10 || rsiDivergence);

      // NEW: Sudden Death Exit (長黑閃崩保護)
      // If price drops more than 6% in one day AND it is a solid black candle
      const isSuddenDeath = (openPrice - close) / openPrice > 0.06 && (openPrice - close) / (high - low) > 0.6;

      const strictStop = isGracePeriod && (close < startPrice - 2 * atrVal); 

      if (strictStop || (!isGracePeriod && (normalExit || structureBreak || hitTrailingStop || highProfitExit || isSuddenDeath))) {
        let exitReason = '平多';
        if (isSuddenDeath) exitReason = '長黑閃崩停損';
        else if (highProfitExit) {
          if (rsiDivergence) exitReason = 'RSI背離止盈';
          else exitReason = '高獲利保護';
        } else if (hitTrailingStop) {
          exitReason = 'ATR移動停利';
        } else if (structureBreak) {
          exitReason = '破前低止損';
        } else if (strictStop) {
          exitReason = '災難停損';
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
      const isGracePeriod = trendDuration <= 6;
      const chandelierStop = lowestPrice + (3.0 * atrVal);
      const hitTrailingStop = close > chandelierStop;
      
      const normalExit = close > m20 && instNet > 0;
      const strictStop = isGracePeriod && (close > startPrice + 2 * atrVal);

      if (strictStop || (!isGracePeriod && (normalExit || hitTrailingStop))) {
        markers.push({
          time: date as Time,
          position: 'belowBar',
          color: '#ff9800',
          shape: 'arrowUp',
          text: hitTrailingStop ? 'ATR移動停損' : '平空',
        });
        currentTrend = null;
        trendDuration = 0;
      }
    }

    // 2. Check for Start Signals (Only if not already in that trend)
    if (currentTrend !== 'long') {
      // ----------------------------------------------------
      // Strategy Update: Split into Reversal vs Breakout
      // ----------------------------------------------------

      const isBullishContext = close > m20 && mh > 0;
      
      // 1. Reversal Entry (Cross MA20)
      const isCrossover = prevClose <= m20 && close > m20;
      
      // 2. Breakout Entry (Already above MA20, breaking high or band)
      const prev20High = Math.max(...highs.slice(i-20, i));
      
      // Check if trigger happened TODAY (to avoid spamming)
      // Note: highs.slice(i-20, i) excludes today (index i).
      // So if close > prev20High, it is a FRESH breakout.
      const isBreakHigh = close > prev20High; 
      const isBbOpening = bbW > prevBbW * 1.1 && close > bbU;
      const isTouXinBuy = getInst(0).netTrust > 0 && getInst(1).netTrust > 0 && getInst(2).netTrust > 0;

      // Volume Filter
      const volRatio = m5v > 0 ? vol / m5v : 0;
      const hasVolume = volRatio > 1.0; 
      const hasExplosiveVolume = volRatio > 1.25;

      // NEW: Candle Body Filter (Relaxed)
      // Allow if body is solid OR if the absolute gain is strong (>3%, handles gap ups)
      const candleRange = high - low;
      const dailyGain = prevClose > 0 ? (close - prevClose) / prevClose : 0;
      const isSolidShape = candleRange > 0 && (close > openPrice) && (close - openPrice) / candleRange > 0.45;
      const isStrongGain = dailyGain > 0.03; // 3% gain
      
      const isQualifyingCandle = isSolidShape || isStrongGain;

      // NEW: Entry Bias Limit (Relaxed)
      // Relaxed to 18% to allow strong momentum stocks
      const isBiasSafe = bias20 < 0.18;

      let signalType: 'cross' | 'breakHigh' | 'bbOpen' | 'touXin' | null = null;
      let reasonText = '';

      if (isBullishContext) {
        // A. Reversal Setup
        // Removed ADX requirement (too lagging)
        // Relaxed to allow strong gains even if volume is just normal-ish for gaps
        if (isCrossover && hasExplosiveVolume && isQualifyingCandle && isBiasSafe) {
           signalType = 'cross';
           reasonText = '起漲(MA20)';
        }
        // B. Continuation Setup (Breakout)
        // 1. Break High & BbOpen
        else if (isBreakHigh && hasVolume && isQualifyingCandle && isBiasSafe) {
           signalType = 'breakHigh';
           reasonText = '破前高';
        }
        else if (isBbOpening && hasVolume && isQualifyingCandle && isBiasSafe) {
           signalType = 'bbOpen';
           reasonText = '布林開口';
        }
        // 2. TouXin signals
        else if (isTouXinBuy && isBiasSafe) {
           signalType = 'touXin';
           reasonText = '投信連買';
        }
      }

      if (signalType) {
        markers.push({
          time: date as Time,
          position: 'belowBar',
          color: '#e91e63',
          shape: 'arrowUp',
          text: reasonText,
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
      const breakdown = close < m20 && prevClose >= m20;
      const weakTech = mh < 0 || k < d;
      const chipSell = instNet < 0;
      
      const deviation = (close - m60) / m60;
      const isOverExtended = deviation > 0.25; 
      const safeShortEnv = !isMa60Rising || isOverExtended;

      if (breakdown && weakTech && chipSell && safeShortEnv) {
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
        lowestPrice = low;
        continue;
      }
    }

    // 3. Check for Add Signals (Only if in trend)
    if (currentTrend === 'long') {
      const bullishArray = m5 > m10 && m10 > m20;
      const touchMa20 = low <= m20 * 1.02 && close >= m20 * 0.98;
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
    }
  }

  return markers;
};
