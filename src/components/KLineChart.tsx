import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  createChart, 
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time, SeriesMarker, ISeriesMarkersPluginApi } from 'lightweight-charts';
import type { StockCandle } from '../api';
import { SMA, BollingerBands, MACD } from 'technicalindicators';
import { type ChartSyncController, UNIFIED_PRICE_SCALE_WIDTH } from '../utils/chartSync';

interface KLineChartProps {
  data: StockCandle[];
  indicators: {
    ma: boolean;
    bollinger: boolean;
    macd: boolean;
    kd: boolean;
  };
  markers?: SeriesMarker<Time>[];
  onLoadMore?: () => void;
  isDarkMode?: boolean;
  initialVisibleBars?: number;
  syncController?: ChartSyncController;
  syncId?: string;
  volumeMode?: 'shares' | 'value';
}

interface BarIndicatorSnapshot {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
}

const formatNum = (val?: number) => {
  if (val === undefined || Number.isNaN(val)) return '-';
  return val >= 1000
    ? val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : val.toFixed(2);
};

const formatVol = (vol: number, mode: 'shares' | 'value' = 'shares') => {
  if (!vol) return '0';
  if (mode === 'value') {
    if (vol >= 1e12) return `${(vol / 1e12).toFixed(2)}兆`;
    if (vol >= 1e8) return `${(vol / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })}億`;
    if (vol >= 1e4) return `${Math.round(vol / 1e4).toLocaleString()}萬`;
    return `${vol.toLocaleString()}元`;
  }
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(1)}億`;
  if (vol >= 1000) return `${Math.round(vol / 1000).toLocaleString()}張`;
  return vol.toLocaleString();
};

export const KLineChart: React.FC<KLineChartProps> = ({ 
  data, 
  indicators, 
  markers, 
  onLoadMore, 
  isDarkMode: propDarkMode,
  initialVisibleBars,
  syncController,
  syncId = 'kline',
  volumeMode = 'shares',
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const maSeriesRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const bbSeriesRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const macdSeriesRefs = useRef<{ hist: ISeriesApi<'Histogram'>; sig: ISeriesApi<'Line'> } | null>(null);
  const dataMapRef = useRef<Map<string, StockCandle>>(new Map());
  const isLoadingMoreRef = useRef(false);
  const onLoadMoreRef = useRef(onLoadMore);
  const prevDataLenRef = useRef<number>(0);
  const prevFirstDateRef = useRef<string>('');
  const prevLastDateRef = useRef<string>('');
  const hasInitializedRangeRef = useRef<boolean>(false);
  const isUpdatingSeriesRef = useRef<boolean>(false);

  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  const [internalDarkMode, setInternalDarkMode] = useState(() => 
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    const updateTheme = () => {
      setInternalDarkMode(document.documentElement.classList.contains('dark'));
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('theme-change', updateTheme);
    return () => {
      observer.disconnect();
      window.removeEventListener('theme-change', updateTheme);
    };
  }, []);

  const isDarkMode = propDarkMode !== undefined ? propDarkMode : internalDarkMode;

  // 計算每一期的開高低收與各項指標數值供頂部彩色圖例列即時顯示
  const snapshotMap = useMemo(() => {
    const map = new Map<string, BarIndicatorSnapshot>();
    if (!data || data.length === 0) return map;

    const closePrices = data.map((d) => d.close);
    const ma5Arr = SMA.calculate({ period: 5, values: closePrices });
    const ma10Arr = SMA.calculate({ period: 10, values: closePrices });
    const ma20Arr = SMA.calculate({ period: 20, values: closePrices });
    const ma60Arr = SMA.calculate({ period: 60, values: closePrices });
    const bbArr = BollingerBands.calculate({ period: 20, stdDev: 2, values: closePrices });
    const macdArr =
      closePrices.length >= 26
        ? MACD.calculate({
            values: closePrices,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false,
          })
        : [];

    const len = data.length;
    const d5 = len - ma5Arr.length;
    const d10 = len - ma10Arr.length;
    const d20 = len - ma20Arr.length;
    const d60 = len - ma60Arr.length;
    const dBb = len - bbArr.length;
    const dMacd = len - macdArr.length;

    for (let i = 0; i < len; i++) {
      const item = data[i];
      const prevClose = i > 0 ? data[i - 1].close : item.open;
      const change = item.close - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      const bbItem = i >= dBb ? bbArr[i - dBb] : undefined;
      const macdItem = i >= dMacd ? macdArr[i - dMacd] : undefined;

      map.set(item.date, {
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
        change,
        changePct,
        ma5: i >= d5 ? ma5Arr[i - d5] : undefined,
        ma10: i >= d10 ? ma10Arr[i - d10] : undefined,
        ma20: i >= d20 ? ma20Arr[i - d20] : undefined,
        ma60: i >= d60 ? ma60Arr[i - d60] : undefined,
        bbUpper: bbItem?.upper,
        bbMiddle: bbItem?.middle,
        bbLower: bbItem?.lower,
        macd: macdItem?.MACD,
        macdSignal: macdItem?.signal,
        macdHist: macdItem?.histogram,
      });
    }

    return map;
  }, [data]);

  // Initial Chart Creation
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDarkMode ? '#9ca3af' : '#64748b',
      },
      width: chartContainerRef.current.clientWidth,
      height: 440,
      grid: {
        vertLines: { color: isDarkMode ? '#1f2937' : '#f1f5f9' },
        horzLines: { color: isDarkMode ? '#1f2937' : '#f1f5f9' },
      },
      timeScale: {
        borderColor: isDarkMode ? '#374151' : '#e2e8f0',
        timeVisible: true,
        fixRightEdge: true,
        rightOffset: 0,
      },
      rightPriceScale: {
        borderColor: isDarkMode ? '#374151' : '#e2e8f0',
        minimumWidth: UNIFIED_PRICE_SCALE_WIDTH,
      },
    });

    chartRef.current = chart;

    // 建立常駐的主圖 Series（成交量與 K 線），關閉副圖在右側價格軸的數值標籤避免遮擋
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#22c55e',
      borderVisible: false,
      wickUpColor: '#ef4444',
      wickDownColor: '#22c55e',
      priceLineVisible: false,
    });
    candlestickSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.08,
        bottom: 0.25,
      },
    });
    candlestickSeriesRef.current = candlestickSeries;
    markersPluginRef.current = createSeriesMarkers(candlestickSeries, []);

    // 若未使用外部 syncController 時的本地 Crosshair 監聽
    chart.subscribeCrosshairMove((param) => {
      if (syncController) return;
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        setHoveredDate(null);
        return;
      }
      setHoveredDate(String(param.time));
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (isUpdatingSeriesRef.current || !range) return;
      if (range.from <= 10 && !isLoadingMoreRef.current && onLoadMoreRef.current) {
        isLoadingMoreRef.current = true;
        Promise.resolve(onLoadMoreRef.current()).finally(() => {
          setTimeout(() => {
            isLoadingMoreRef.current = false;
          }, 500);
        });
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      volumeSeriesRef.current = null;
      candlestickSeriesRef.current = null;
      markersPluginRef.current = null;
      maSeriesRefs.current = [];
      bbSeriesRefs.current = [];
      macdSeriesRefs.current = null;
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (e) {}
        chartRef.current = null;
      }
    };
  }, []);

  // 註冊至多圖表同步控制器
  useEffect(() => {
    if (!syncController || !chartRef.current) return;
    return syncController.register({
      id: syncId,
      chart: chartRef.current,
      getMainSeries: () => candlestickSeriesRef.current,
      getValueAtTime: (timeStr) => dataMapRef.current.get(timeStr)?.close,
      onHoverTimeChange: (timeStr) => setHoveredDate(timeStr),
      isUpdatingSeries: () => isUpdatingSeriesRef.current,
    });
  }, [syncController, syncId]);

  // Update Theme
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: isDarkMode ? '#9ca3af' : '#64748b',
        },
        grid: {
          vertLines: { color: isDarkMode ? '#1f2937' : '#f1f5f9' },
          horzLines: { color: isDarkMode ? '#1f2937' : '#f1f5f9' },
        },
        timeScale: {
          borderColor: isDarkMode ? '#374151' : '#e2e8f0',
          fixRightEdge: true,
          rightOffset: 0,
        },
        rightPriceScale: {
          borderColor: isDarkMode ? '#374151' : '#e2e8f0',
          minimumWidth: UNIFIED_PRICE_SCALE_WIDTH,
        },
      });
    }
  }, [isDarkMode]);

  // Update Data and Indicators (直接對現有 Series 呼叫 setData，讓 lightweight-charts 原生保留時間軸偏移與拖曳狀態)
  useEffect(() => {
    const chart = chartRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const candlestickSeries = candlestickSeriesRef.current;
    if (!chart || !volumeSeries || !candlestickSeries || data.length === 0) return;

    const map = new Map<string, StockCandle>();
    for (const item of data) {
      map.set(item.date, item);
    }
    dataMapRef.current = map;

    const prevLen = prevDataLenRef.current;
    const prevFirst = prevFirstDateRef.current;
    const prevLast = prevLastDateRef.current;
    const curFirst = data[0].date;
    const curLast = data[data.length - 1].date;
    const datasetKey = `${curFirst}_${curLast}_${data.length}`;

    const isInitialLoad = prevLen === 0 || !hasInitializedRangeRef.current;
    const isPrepended = prevLen > 0 && data.length > prevLen && curFirst < prevFirst && curLast === prevLast;
    const isSameDataset = prevLen > 0 && data.length === prevLen && curFirst === prevFirst && curLast === prevLast;

    prevDataLenRef.current = data.length;
    prevFirstDateRef.current = curFirst;
    prevLastDateRef.current = curLast;

    isUpdatingSeriesRef.current = true;

    try {
      // 1. 更新成交量與 K 線資料
      volumeSeries.setData(
        data.map((d) => ({
          time: d.date as Time,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.5)',
        }))
      );

      candlestickSeries.setData(
        data.map((d) => ({
          time: d.date as Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      );

      if (markersPluginRef.current) {
        markersPluginRef.current.setMarkers(markers && markers.length > 0 ? markers : []);
      }

      const closePrices = data.map((d) => d.close);

      // 2. 更新 MA 均線指標 (關閉右側標籤與橫線，改由上方彩色圖例列顯示)
      if (indicators.ma) {
        const periods = [5, 10, 20, 60];
        const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];
        if (maSeriesRefs.current.length === 0) {
          maSeriesRefs.current = periods.map((_period, idx) =>
            chart.addSeries(LineSeries, {
              color: colors[idx],
              lineWidth: 1,
              lastValueVisible: false,
              priceLineVisible: false,
            })
          );
        }
        periods.forEach((period, idx) => {
          const series = maSeriesRefs.current[idx];
          if (!series) return;
          const maValues = SMA.calculate({ period, values: closePrices });
          if (maValues && maValues.length > 0) {
            const diff = data.length - maValues.length;
            series.setData(maValues.map((v, i) => ({ time: data[i + diff].date as Time, value: v })));
          } else {
            series.setData([]);
          }
        });
      } else if (maSeriesRefs.current.length > 0) {
        maSeriesRefs.current.forEach((s) => {
          try {
            chart.removeSeries(s);
          } catch (e) {}
        });
        maSeriesRefs.current = [];
      }

      // 3. 更新布林通道指標 (關閉右側標籤與橫線)
      if (indicators.bollinger) {
        const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closePrices });
        if (bb && bb.length > 0) {
          if (bbSeriesRefs.current.length === 0) {
            const u = chart.addSeries(LineSeries, {
              color: 'rgba(4, 111, 232, 0.35)',
              lineWidth: 1,
              lastValueVisible: false,
              priceLineVisible: false,
            });
            const l = chart.addSeries(LineSeries, {
              color: 'rgba(4, 111, 232, 0.35)',
              lineWidth: 1,
              lastValueVisible: false,
              priceLineVisible: false,
            });
            const m = chart.addSeries(LineSeries, {
              color: 'rgba(4, 111, 232, 0.55)',
              lineWidth: 1,
              lineStyle: 2,
              lastValueVisible: false,
              priceLineVisible: false,
            });
            bbSeriesRefs.current = [u, l, m];
          }
          const diff = data.length - bb.length;
          bbSeriesRefs.current[0].setData(bb.map((v, i) => ({ time: data[i + diff].date as Time, value: v.upper })));
          bbSeriesRefs.current[1].setData(bb.map((v, i) => ({ time: data[i + diff].date as Time, value: v.lower })));
          bbSeriesRefs.current[2].setData(bb.map((v, i) => ({ time: data[i + diff].date as Time, value: v.middle })));
        }
      } else if (bbSeriesRefs.current.length > 0) {
        bbSeriesRefs.current.forEach((s) => {
          try {
            chart.removeSeries(s);
          } catch (e) {}
        });
        bbSeriesRefs.current = [];
      }

      // 4. 更新 MACD 指標 (關閉右側標籤與橫線)
      if (indicators.macd) {
        const macdData = MACD.calculate({
          values: closePrices,
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
          SimpleMAOscillator: false,
          SimpleMASignal: false,
        });
        if (macdData && macdData.length > 0) {
          chart.priceScale('left').applyOptions({ visible: true, scaleMargins: { top: 0.8, bottom: 0 } });
          if (!macdSeriesRefs.current) {
            const hist = chart.addSeries(HistogramSeries, {
              color: '#2962FF',
              priceScaleId: 'left',
              lastValueVisible: false,
              priceLineVisible: false,
            });
            const sig = chart.addSeries(LineSeries, {
              color: '#FF6D00',
              lineWidth: 1,
              priceScaleId: 'left',
              lastValueVisible: false,
              priceLineVisible: false,
            });
            macdSeriesRefs.current = { hist, sig };
          }
          const diff = data.length - macdData.length;
          macdSeriesRefs.current.hist.setData(
            macdData.map((v, i) => ({
              time: data[i + diff].date as Time,
              value: v.MACD || 0,
              color: (v.MACD || 0) > 0 ? '#ef4444' : '#22c55e',
            }))
          );
          macdSeriesRefs.current.sig.setData(
            macdData.map((v, i) => ({ time: data[i + diff].date as Time, value: v.signal || 0 }))
          );
        }
      } else if (macdSeriesRefs.current) {
        try {
          chart.removeSeries(macdSeriesRefs.current.hist);
          chart.removeSeries(macdSeriesRefs.current.sig);
          chart.priceScale('left').applyOptions({ visible: false });
        } catch (e) {}
        macdSeriesRefs.current = null;
      }

      // 5. 僅在初次載入或切換不同標的/週期時設定預設可視區間
      if (isInitialLoad || (!isPrepended && !isSameDataset)) {
        const syncedRange = syncController?.getCurrentRange(datasetKey);
        if (syncedRange) {
          chart.timeScale().setVisibleLogicalRange(syncedRange);
          hasInitializedRangeRef.current = true;
        } else if (initialVisibleBars && data.length > initialVisibleBars) {
          const targetRange = {
            from: data.length - initialVisibleBars,
            to: data.length - 1,
          };
          chart.timeScale().setVisibleLogicalRange(targetRange);
          syncController?.setCurrentRange(targetRange, datasetKey);
          hasInitializedRangeRef.current = true;
        } else if (!onLoadMore || data.length < 200) {
          chart.timeScale().fitContent();
          const curRange = chart.timeScale().getVisibleLogicalRange();
          if (curRange) {
            syncController?.setCurrentRange(curRange, datasetKey);
          }
          hasInitializedRangeRef.current = true;
        } else {
          chart.timeScale().scrollToPosition(0, false);
          const curRange = chart.timeScale().getVisibleLogicalRange();
          if (curRange) {
            syncController?.setCurrentRange(curRange, datasetKey);
          }
          hasInitializedRangeRef.current = true;
        }
      } else if (isPrepended) {
        const shiftedRange = chart.timeScale().getVisibleLogicalRange();
        if (shiftedRange) {
          syncController?.setCurrentRange(shiftedRange, datasetKey);
        }
      }
    } catch (e) {
      console.error('Error updating series:', e);
    } finally {
      isUpdatingSeriesRef.current = false;
    }
  }, [data, indicators.ma, indicators.bollinger, indicators.macd, indicators.kd, markers, initialVisibleBars, syncController]);

  const activeDate = hoveredDate || (data.length > 0 ? data[data.length - 1].date : null);
  const activeSnap = activeDate ? snapshotMap.get(activeDate) : null;

  return (
    <div className="w-full flex flex-col">
      {/* 頂部彩色動態指標與行情資訊列 */}
      {activeSnap && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-2 py-1.5 mb-1 rounded-lg bg-gray-50/90 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700/60 text-xs">
          {/* 開高低收與漲跌 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-gray-600 dark:text-gray-300">{activeSnap.date}</span>
            <span className="text-gray-500 dark:text-gray-400">
              開 <strong className="text-gray-800 dark:text-gray-200">{formatNum(activeSnap.open)}</strong>
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              高 <strong className="text-red-500">{formatNum(activeSnap.high)}</strong>
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              低 <strong className="text-emerald-500">{formatNum(activeSnap.low)}</strong>
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              收{' '}
              <strong className={activeSnap.change >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                {formatNum(activeSnap.close)}
              </strong>
            </span>
            <span className={`font-semibold ${activeSnap.change >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {activeSnap.change >= 0 ? '+' : ''}
              {activeSnap.change.toFixed(2)} ({activeSnap.change >= 0 ? '+' : ''}
              {activeSnap.changePct.toFixed(2)}%)
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {volumeMode === 'value' ? '額' : '量'}{' '}
              <strong className="text-gray-700 dark:text-gray-300">{formatVol(activeSnap.volume, volumeMode)}</strong>
            </span>
          </div>

          {/* 彩色技術指標圖例 (均線 / 布林 / MACD) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
            {indicators.ma && (
              <>
                <span className="inline-flex items-center gap-1" style={{ color: '#f59e0b' }}>
                  <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                  MA5: <strong>{formatNum(activeSnap.ma5)}</strong>
                </span>
                <span className="inline-flex items-center gap-1" style={{ color: '#ec4899' }}>
                  <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ backgroundColor: '#ec4899' }} />
                  MA10: <strong>{formatNum(activeSnap.ma10)}</strong>
                </span>
                <span className="inline-flex items-center gap-1" style={{ color: '#8b5cf6' }}>
                  <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ backgroundColor: '#8b5cf6' }} />
                  MA20: <strong>{formatNum(activeSnap.ma20)}</strong>
                </span>
                <span className="inline-flex items-center gap-1" style={{ color: '#3b82f6' }}>
                  <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                  MA60: <strong>{formatNum(activeSnap.ma60)}</strong>
                </span>
              </>
            )}

            {indicators.bollinger && (
              <span className="inline-flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                <span className="inline-block w-2.5 h-0.5 border-b border-dashed border-sky-500" />
                BB(20,2) 上:<strong>{formatNum(activeSnap.bbUpper)}</strong> 中:<strong>{formatNum(activeSnap.bbMiddle)}</strong> 下:<strong>{formatNum(activeSnap.bbLower)}</strong>
              </span>
            )}

            {indicators.macd && (
              <span className="inline-flex items-center gap-2">
                <span style={{ color: '#2962FF' }}>
                  DIF: <strong>{activeSnap.macd !== undefined ? activeSnap.macd.toFixed(2) : '-'}</strong>
                </span>
                <span style={{ color: '#FF6D00' }}>
                  DEA: <strong>{activeSnap.macdSignal !== undefined ? activeSnap.macdSignal.toFixed(2) : '-'}</strong>
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};
