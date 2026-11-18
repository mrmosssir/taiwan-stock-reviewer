import { SMA, RSI, Stochastic, MACD } from 'technicalindicators';
import type { MarketDailyRecord } from '../api';

/**
 * 針對歷史大盤陣列計算所有技術指標與每日/週/月多空評分
 * records 必須以日期遞增排序 (由舊到新)
 */
export const calculateMarketSignals = (records: MarketDailyRecord[]): MarketDailyRecord[] => {
  if (records.length === 0) return [];

  const closes = records.map(r => r.close);
  const highs = records.map(r => r.high);
  const lows = records.map(r => r.low);

  // 1. 計算均線
  const ma5Values = SMA.calculate({ period: 5, values: closes });
  const ma20Values = SMA.calculate({ period: 20, values: closes });
  const ma60Values = SMA.calculate({ period: 60, values: closes });

  // 2. 計算 RSI (14)
  const rsiValues = closes.length >= 14 ? RSI.calculate({ period: 14, values: closes }) : [];

  // 3. 計算 KD (9, 3, 3)
  const kdValues = closes.length >= 9 ? Stochastic.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 9,
    signalPeriod: 3
  }) : [];

  // 4. 計算 MACD (12, 26, 9)
  const macdValues = closes.length >= 26 ? MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  }) : [];

  // 對齊各指標長度
  const padStart = (arr: number[], targetLength: number) => {
    const diff = targetLength - arr.length;
    return diff > 0 ? Array(diff).fill(0).concat(arr) : arr;
  };

  const paddedMa5 = padStart(ma5Values, records.length);
  const paddedMa20 = padStart(ma20Values, records.length);
  const paddedMa60 = padStart(ma60Values, records.length);
  const paddedRsi = padStart(rsiValues, records.length);

  const kdDiff = records.length - kdValues.length;
  const paddedK = kdDiff > 0 ? Array(kdDiff).fill(50).concat(kdValues.map(v => v.k ?? 50)) : kdValues.map(v => v.k ?? 50);
  const paddedD = kdDiff > 0 ? Array(kdDiff).fill(50).concat(kdValues.map(v => v.d ?? v.k ?? 50)) : kdValues.map(v => v.d ?? v.k ?? 50);

  const macdDiff = records.length - macdValues.length;
  const paddedHist = macdDiff > 0 ? Array(macdDiff).fill(0).concat(macdValues.map(v => v.histogram ?? 0)) : macdValues.map(v => v.histogram ?? 0);

  // 5. 走訪每一期計算指標與多空評分
  return records.map((record, i) => {
    // 漸進式均線：若資料剛起步不足天數，有幾筆算幾筆
    const ma5 = paddedMa5[i] > 0 ? paddedMa5[i] : (closes.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1));
    const ma20 = paddedMa20[i] > 0 ? paddedMa20[i] : (closes.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1));
    const ma60 = paddedMa60[i] > 0 ? paddedMa60[i] : (closes.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1));
    const rsi14 = paddedRsi[i];
    const kdK = paddedK[i];
    const kdD = paddedD[i];
    const macdHist = paddedHist[i];

    // ==========================================
    // A. 技術趨勢面 (滿分 45 分)
    // ==========================================
    let techScore = 0;
    // 站上 20 期均線 (15 分)
    if (ma20 > 0 && record.close >= ma20) techScore += 15;
    // 站上 60 期均線 (12 分)
    if (ma60 > 0 && record.close >= ma60) techScore += 12;
    // 20MA >= 60MA (多頭排列) (6 分)
    if (ma20 > 0 && ma60 > 0 && ma20 >= ma60) techScore += 6;
    // KD 動能偏多 (6 分)
    if (kdK > 50 && kdK > kdD) {
      techScore += 6;
    } else if (kdK > 50) {
      techScore += 3;
    }
    // MACD 柱狀體翻紅 (6 分)
    if (macdHist > 0) techScore += 6;

    // 判斷是否為「盤中即時尚未結算籌碼」之 K 線 (isIntraday 或最後一根且三大法人與期貨皆為 0)
    const prevRecord = i > 0 ? records[i - 1] : null;
    const isIntradayPending =
      Boolean(record.isIntraday) ||
      (i === records.length - 1 &&
        i > 0 &&
        record.foreignNet === 0 &&
        record.trustNet === 0 &&
        record.dealerNet === 0 &&
        record.foreignFuturesOI === 0);

    // ==========================================
    // B. 期貨主力避險與 OI 動態 (滿分 20 分)
    // 若盤中尚未公布當日期貨未平倉，自動繼承前一交易日已結算之留倉水位與變動
    // ==========================================
    let futuresScore = 0;
    const effectiveOI =
      isIntradayPending && record.foreignFuturesOI === 0 && prevRecord
        ? prevRecord.foreignFuturesOI
        : record.foreignFuturesOI;

    // 過去 60 期滾動外資期貨平均水位
    const oiSlice =
      isIntradayPending && record.foreignFuturesOI === 0 && i > 0
        ? records.slice(Math.max(0, i - 60), i)
        : records.slice(Math.max(0, i - 59), i + 1);
    const pastOI = oiSlice.map(r => r.foreignFuturesOI);
    const avgOI = pastOI.length > 0 ? pastOI.reduce((a, b) => a + b, 0) / pastOI.length : 0;

    // 基準分 (10 分)：評估相對於近 60 期常態
    if (effectiveOI >= 0) {
      futuresScore += 10;
    } else if (effectiveOI >= avgOI) {
      futuresScore += 9;
    } else if (avgOI - effectiveOI <= 8000) {
      futuresScore += 7;
    } else if (avgOI - effectiveOI <= 15000) {
      futuresScore += 4;
    } else {
      futuresScore += 2;
    }

    // 當期增減動能 (5 分)
    const diffOI =
      isIntradayPending && record.foreignFuturesOI === 0 && prevRecord
        ? i >= 2
          ? prevRecord.foreignFuturesOI - records[i - 2].foreignFuturesOI
          : 0
        : i > 0
        ? effectiveOI - records[i - 1].foreignFuturesOI
        : 0;
    if (diffOI >= 1500) {
      futuresScore += 5;
    } else if (diffOI >= -1500) {
      futuresScore += 3;
    } else {
      futuresScore += 0;
    }

    // 期現貨聯動 (5 分)
    const effectiveForeignNet =
      isIntradayPending && record.foreignNet === 0 && prevRecord
        ? prevRecord.foreignNet
        : record.foreignNet;
    const effectiveTrustNet =
      isIntradayPending && record.trustNet === 0 && prevRecord
        ? prevRecord.trustNet
        : record.trustNet;

    if (effectiveForeignNet > 0) {
      futuresScore += 5;
    } else if (effectiveForeignNet <= 0 && diffOI <= -2000) {
      futuresScore += 0;
    } else {
      futuresScore += 3;
    }

    // ==========================================
    // C. 現貨法人籌碼面 (滿分 20 分)
    // 若盤中尚未公布當日法人買賣超，自動繼承前一交易日留倉態度與近 5 日累計趨勢
    // ==========================================
    let instScore = 0;
    const instNet = effectiveForeignNet + effectiveTrustNet;
    if (instNet > 0) {
      instScore += 8;
      if (effectiveForeignNet > 0 && effectiveTrustNet > 0) {
        instScore += 2;
      }
    }
    // 近 5 期累計買賣超趨勢 (10 分)
    const inst5Periods =
      isIntradayPending && record.foreignNet === 0 && record.trustNet === 0 && i > 0
        ? records.slice(Math.max(0, i - 5), i)
        : records.slice(Math.max(0, i - 4), i + 1);
    const sumInst5 = inst5Periods.reduce((acc, r) => acc + (r.foreignNet + r.trustNet), 0);
    if (sumInst5 > 0) {
      instScore += 10;
    }

    // ==========================================
    // D. 散戶信用交易面 (滿分 15 分)
    // 結合前日已結算融資水位與今日盤中即時漲跌 (change) 動態評估
    // ==========================================
    let marginScore = 0;
    const change = record.change ?? (prevRecord ? Number((record.close - prevRecord.close).toFixed(2)) : 0);
    const effectiveMarginBalance =
      (record.marginBalance || 0) > 0
        ? record.marginBalance
        : prevRecord?.marginBalance || 0;
    const effectiveMarginDiff =
      (record.marginBalance || 0) > 0 && !record.isIntraday
        ? record.marginDiff
        : prevRecord?.marginDiff || 0;
    const isAboveMa20 = ma20 > 0 && record.close >= ma20;
    const hasMarginData = effectiveMarginBalance > 0;

    if (!hasMarginData) {
      marginScore = isAboveMa20 ? 10 : 8;
    } else if (isAboveMa20) {
      if (change > 0 && effectiveMarginDiff > 0) {
        marginScore = 14;
      } else if (change > 0 && effectiveMarginDiff <= 0) {
        marginScore = 15;
      } else if (change <= 0 && effectiveMarginDiff <= 0) {
        marginScore = 10;
      } else {
        marginScore = 4;
      }
    } else {
      if (change > 0 && effectiveMarginDiff <= 0) {
        marginScore = 13;
      } else if (change > 0 && effectiveMarginDiff > 0) {
        marginScore = 8;
      } else if (change <= 0 && effectiveMarginDiff <= 0) {
        marginScore = 8;
      } else {
        marginScore = 0;
      }
    }

    const hasFuturesData = effectiveOI !== 0 || avgOI !== 0;
    const hasInstData =
      effectiveForeignNet !== 0 ||
      effectiveTrustNet !== 0 ||
      record.dealerNet !== 0 ||
      sumInst5 !== 0;

    let rawScore = techScore;
    let maxPossibleScore = 45;

    if (hasFuturesData) {
      rawScore += futuresScore;
      maxPossibleScore += 20;
    }
    if (hasInstData) {
      rawScore += instScore;
      maxPossibleScore += 20;
    }
    if (hasMarginData || hasInstData || hasFuturesData) {
      rawScore += marginScore;
      maxPossibleScore += 15;
    }

    const normalizedScore = maxPossibleScore > 0 ? (rawScore / maxPossibleScore) * 100 : 50;
    const totalScore = Math.min(100, Math.max(0, Math.round(normalizedScore)));

    let status: 'bull' | 'consolidation' | 'bear' = 'consolidation';
    let statusText = '區間震盪';
    if (totalScore >= 65) {
      status = 'bull';
      statusText = '強勢多頭';
    } else if (totalScore >= 55) {
      status = 'bull';
      statusText = '偏多多頭';
    } else if (totalScore <= 35) {
      status = 'bear';
      statusText = '弱勢空頭';
    } else if (totalScore <= 45) {
      status = 'bear';
      statusText = '偏弱空頭';
    }

    // 生成摘要說明
    const highlights: string[] = [];
    if (ma20 > 0 && record.close >= ma20 && ma60 > 0 && ma20 >= ma60) {
      highlights.push('均線維持多頭排列 (站上20MA與60MA)');
    } else if (ma20 > 0 && record.close >= ma20) {
      highlights.push('收盤站上20MA月線支撐');
    } else if (ma20 > 0 && record.close < ma20) {
      highlights.push('跌破20MA，防守均線反壓');
    }

    if (diffOI >= 1500) {
      highlights.push(`外資期貨空單回補 ${diffOI.toLocaleString()} 口 (淨部位 ${effectiveOI.toLocaleString()} 口)`);
    } else if (effectiveOI <= -50000) {
      highlights.push(`外資期貨淨部位 ${effectiveOI.toLocaleString()} 口 (高檔對沖避險)`);
    } else if (effectiveOI !== 0) {
      highlights.push(`外資期貨淨部位 ${effectiveOI > 0 ? '+' : ''}${effectiveOI.toLocaleString()} 口`);
    }

    const foreignBillion = (effectiveForeignNet / 1e8).toFixed(1);
    const trustBillion = (effectiveTrustNet / 1e8).toFixed(1);
    if (effectiveForeignNet !== 0 || effectiveTrustNet !== 0) {
      highlights.push(
        `${isIntradayPending && record.foreignNet === 0 ? '前日' : ''}外資現貨 ${foreignBillion} 億、投信 ${trustBillion} 億`
      );
    }

    if (hasMarginData && !isIntradayPending) {
      const marginDiffMillion = (effectiveMarginDiff / 100).toFixed(1);
      if (effectiveMarginDiff > 0) {
        highlights.push(`融資增加 ${marginDiffMillion} 萬元`);
      } else if (effectiveMarginDiff < 0) {
        highlights.push(`融資減少 ${Math.abs(Number(marginDiffMillion))} 萬元`);
      }
    }

    const prefix = isIntradayPending ? '【盤中即時】' : '';

    return {
      ...record,
      change,
      foreignFuturesOI: effectiveOI,
      marginBalance: effectiveMarginBalance,
      shortBalance:
        (record.shortBalance || 0) > 0 ? record.shortBalance : prevRecord?.shortBalance || 0,
      ma5: Number((ma5 ?? 0).toFixed(2)),
      ma20: Number((ma20 ?? 0).toFixed(2)),
      ma60: Number((ma60 ?? 0).toFixed(2)),
      rsi14: Number((rsi14 ?? 50).toFixed(2)),
      kdK: Number((kdK ?? 50).toFixed(2)),
      kdD: Number((kdD ?? 50).toFixed(2)),
      macdHist: Number((macdHist ?? 0).toFixed(2)),
      score: totalScore,
      status,
      statusText,
      summary: `${prefix}${highlights.join('；')}`
    };
  });
};
