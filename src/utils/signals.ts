import { SMA, MACD, Stochastic, BollingerBands, RSI } from 'technicalindicators';
import type { StockCandle, InstitutionalData, StockTicker, ComprehensiveFinancials } from '../api';
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

// 動態判定是否為大型權值股
const isLargeCapStock = (
  candles: StockCandle[],
  ticker: StockTicker | null,
  financials?: ComprehensiveFinancials
): boolean => {
  if (ticker?.market === 'OTC') {
    // 上櫃股原則上歸類為中小型股
    return false;
  }

  // 1. 計算近期平均每日成交金額 (20日均量 Turnover)
  let avgTurnover = 0;
  const recentCandles = candles.slice(-20);
  if (recentCandles.length > 0) {
    const totalTurnover = recentCandles.reduce((acc, c) => acc + (c.close * c.volume), 0);
    avgTurnover = totalTurnover / recentCandles.length;
  }

  // 2. 檢查最新季營收規模 (Revenue)
  let latestRevenue = 0;
  if (financials && financials.revenue.length > 0) {
    latestRevenue = financials.revenue[financials.revenue.length - 1].value;
  }

  // 3. 權值巨頭代號作為輔助防呆確認
  const megaCapSymbols = ['2330', '2317', '2454', '2308', '2337', '2382', '2881', '2882', '2891', '2412', '2886', '2884', '2892', '1301', '1303', '2002'];
  if (ticker && megaCapSymbols.includes(ticker.symbol)) {
    return true;
  }

  // 動態門檻判定：若季營收超過 200 億，或近20日平均每日 turnover 超過 5 億
  if (latestRevenue > 20000000000 || avgTurnover > 500000000) {
    return true;
  }

  return false;
};

export const calculateSignals = (
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
        // 大型權值股平倉防護：走勢穩定，需連續 2 日跌破 MA20，或跌破 MA20 且伴隨法人強力連續賣超
        const breakdownMA20 = (close < m20 && prevClose < m20) || (close < m20 * 0.99 && major3DaysNet < 0);
        // 破前 20 日波段低點
        const prev20Low = Math.min(...lows.slice(i-20, i));
        const structureBreak = close < prev20Low;
        // 起漲防護
        const strictStop = trendDuration <= 10 && (close < startPrice * 0.92);

        shouldExit = breakdownMA20 || structureBreak || strictStop;
      } else {
        // 中小型飆股平倉防護：防甩轎與爆量長黑防護
        const breakdownMA20 = (close < m20 && prevClose < m20) || (close < m20 * 0.98 && (instToday.net < 0 || major3DaysNet < 0));
        const prev15Low = Math.min(...lows.slice(i-15, i));
        const structureBreak = close < prev15Low;
        const isClimaxSubside = (openPrice - close) / openPrice > 0.05 && 
                                 (vol / m5v > 3.0) && 
                                 (close - low) / (high - low) < 0.15;
        const strictStop = trendDuration <= 10 && (close < startPrice * 0.92);

        shouldExit = breakdownMA20 || structureBreak || isClimaxSubside || strictStop;
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
        continue;
      }

      // ----------------------------------------------------
      // 2. 加碼邏輯 (Add Signals) - 雙軌制加碼
      // ----------------------------------------------------
      if (i - lastAddIndex >= 5 && trendDuration >= 5) {
        const bullishArray = m5 > m10 && m10 > m20;
        const touchMA = (low <= m10 * 1.015 && close >= m20 * 0.99);
        const kdCross = k > d && kLine[i-1]! <= dLine[i-1]!;
        const macdStrengthening = mh > prevMh;
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

        if (bullishArray && (touchMA || (kdCross && macdStrengthening)) && instBuySupport && safeBias) {
          markers.push({
            time: date as Time,
            position: 'belowBar',
            color: '#2196F3',
            shape: 'arrowUp',
            text: '加碼',
          });
          lastAddIndex = i;
        }
      }
    } else {
      // ----------------------------------------------------
      // 3. 啟動邏輯 (Entry Signals) - 雙軌制分流突破
      // ----------------------------------------------------
      // 專注於做多，不產生做空訊號。
      
      let shouldEnter = false;

      if (isLargeCap) {
        // 【大型權值股專屬軌道】
        // (a) 溫和成交量放大：不需 1.58 倍，只需滿足推動量 1.10 倍以上
        const hasVolumeBreakout = m20v > 0 ? (m5v / m20v > 1.10 || vol / m20v > 1.15) : false;
        // (b) 趨勢與技術共振：站在 MA20 之上，MACD 為正或轉強，RSI 位於 48~82 穩健區間
        const macdSynergy = mh > 0 || (mh > prevMh && mh > -0.02);
        const kdSynergy = k > d && k > 20;
        const isBullishContext = close > m20 && rsiVal > 48 && rsiVal < 82 && macdSynergy && kdSynergy;
        // (c) 觸發條件：均線多頭排列或剛穿越 MA20
        const isCrossover = prevClose <= m20 * 1.01 && close > m20;
        const isMovingUp = m5 > m10 && close > m10;
        // (d) 重籌碼依賴：外資或三大法人連續買超，展現機構建倉意圖
        const hasInstitutionalSupport = major3DaysNet > 0 || (instToday.net > 0 && instPrev1.net > 0);
        // (e) 乖離控制
        const isBiasSafe = bias20 < 0.12;

        shouldEnter = hasVolumeBreakout && isBullishContext && (isCrossover || isMovingUp) && hasInstitutionalSupport && isBiasSafe;
      } else {
        // 【中小型飆股專屬軌道】
        // (a) 巨量突破：5日均量 > 20日均量 1.58 倍以上，或當日爆量 > 2.0 倍
        const hasVolumeBreakout = m20v > 0 ? ((m5v / m20v > 1.58) || (vol / m20v > 2.0)) : false;
        // (b) 技術面多頭共振
        const macdSynergy = mh > 0 || (mh > prevMh);
        const kdSynergy = k > d && k > 20;
        const isBullishContext = close > m20 && rsiVal > 48 && rsiVal < 86 && macdSynergy && kdSynergy;
        // (c) 觸發條件 (三選一)
        const isCrossover = prevClose <= m20 * 1.015 && close > m20;
        const prev20High = Math.max(...highs.slice(i-20, i));
        const isBreakHigh = close > prev20High; 
        const isBbOpening = bbW > prevBbW * 1.05 && close >= bbU * 0.99;
        // (d) 籌碼與主力彈性判定
        const dailyGain = prevClose > 0 ? (close - prevClose) / prevClose : 0;
        const isStrongPriceAction = dailyGain > 0.04 || (isBreakHigh && vol / m20v > 2.5);
        const hasInstitutionalOrMajorSupport = major3DaysNet > 0 || instToday.net > 0 || isStrongPriceAction;
        // (e) K線型態與乖離過濾
        const isRedCandle = close >= openPrice || dailyGain > 0.02;
        const isBiasSafe = bias20 < 0.22;

        shouldEnter = hasVolumeBreakout && isBullishContext && (isCrossover || isBreakHigh || isBbOpening) && hasInstitutionalOrMajorSupport && isRedCandle && isBiasSafe;
      }

      if (shouldEnter) {
        markers.push({
          time: date as Time,
          position: 'belowBar',
          color: '#e91e63',
          shape: 'arrowUp',
          text: '啟動',
        });
        currentTrend = 'long';
        trendDuration = 0;
        startPrice = close;
        highestPrice = high;
        lastAddIndex = i;
      }
    }
  }

  return markers;
};

