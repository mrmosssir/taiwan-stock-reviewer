import React, { useEffect, useRef, useState } from 'react';
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
}

export const KLineChart: React.FC<KLineChartProps> = ({ 
  data, 
  indicators, 
  markers, 
  onLoadMore, 
  isDarkMode: propDarkMode,
  initialVisibleBars,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const maSeriesRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const bbSeriesRefs = useRef<ISeriesApi<'Line'>[]>([]);
  const macdSeriesRefs = useRef<{ hist: ISeriesApi<'Histogram'>; sig: ISeriesApi<'Line'> } | null>(null);
  const isLoadingMoreRef = useRef(false);
  const onLoadMoreRef = useRef(onLoadMore);
  const prevDataLenRef = useRef<number>(0);
  const prevFirstDateRef = useRef<string>('');
  const prevLastDateRef = useRef<string>('');
  const hasInitializedRangeRef = useRef<boolean>(false);
  const isUpdatingSeriesRef = useRef<boolean>(false);

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

  // Initial Chart Creation
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDarkMode ? '#9ca3af' : '#64748b',
      },
      width: chartContainerRef.current.clientWidth,
      height: 460,
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
    });

    chartRef.current = chart;

    // 建立常駐的主圖 Series（成交量與 K 線），避免每次資料更新 removeSeries 重置時間軸與拖曳狀態
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
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
    });
    candlestickSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.25,
      },
    });
    candlestickSeriesRef.current = candlestickSeries;
    markersPluginRef.current = createSeriesMarkers(candlestickSeries, []);

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
      });
    }
  }, [isDarkMode]);

  // Update Data and Indicators (直接對現有 Series 呼叫 setData，讓 lightweight-charts 原生保留時間軸偏移與拖曳狀態)
  useEffect(() => {
    const chart = chartRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const candlestickSeries = candlestickSeriesRef.current;
    if (!chart || !volumeSeries || !candlestickSeries || data.length === 0) return;

    const prevLen = prevDataLenRef.current;
    const prevFirst = prevFirstDateRef.current;
    const prevLast = prevLastDateRef.current;
    const curFirst = data[0].date;
    const curLast = data[data.length - 1].date;

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

      // 2. 更新 MA 均線指標
      if (indicators.ma) {
        const periods = [5, 10, 20, 60];
        const colors = ['#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6'];
        if (maSeriesRefs.current.length === 0) {
          maSeriesRefs.current = periods.map((period, idx) =>
            chart.addSeries(LineSeries, { color: colors[idx], lineWidth: 1, title: `MA${period}` })
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

      // 3. 更新布林通道指標
      if (indicators.bollinger) {
        const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closePrices });
        if (bb && bb.length > 0) {
          if (bbSeriesRefs.current.length === 0) {
            const u = chart.addSeries(LineSeries, { color: 'rgba(4, 111, 232, 0.2)', lineWidth: 1 });
            const l = chart.addSeries(LineSeries, { color: 'rgba(4, 111, 232, 0.2)', lineWidth: 1 });
            const m = chart.addSeries(LineSeries, { color: 'rgba(4, 111, 232, 0.4)', lineWidth: 1, lineStyle: 2 });
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

      // 4. 更新 MACD 指標
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
            const hist = chart.addSeries(HistogramSeries, { color: '#2962FF', priceScaleId: 'left' });
            const sig = chart.addSeries(LineSeries, { color: '#FF6D00', lineWidth: 1, priceScaleId: 'left' });
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

      // 5. 僅在初次載入或切換不同標的時設定預設可視區間；
      // 若為往前補齊舊資料 (isPrepended) 或切換指標/訊號 (isSameDataset)，
      // lightweight-charts 會在 setData 時自動根據 baseIndex 更新並保持當前 _rightOffset 與滑鼠拖曳狀態，不需手動重設範圍
      if (isInitialLoad || (!isPrepended && !isSameDataset)) {
        if (initialVisibleBars && data.length > initialVisibleBars) {
          chart.timeScale().setVisibleLogicalRange({
            from: data.length - initialVisibleBars,
            to: data.length - 1,
          });
          hasInitializedRangeRef.current = true;
        } else if (!onLoadMore || data.length < 200) {
          chart.timeScale().fitContent();
          hasInitializedRangeRef.current = true;
        } else {
          chart.timeScale().scrollToPosition(0, false);
          hasInitializedRangeRef.current = true;
        }
      }
    } catch (e) {
      console.error('Error updating series:', e);
    } finally {
      isUpdatingSeriesRef.current = false;
    }
  }, [data, indicators.ma, indicators.bollinger, indicators.macd, indicators.kd, markers, initialVisibleBars]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
};
