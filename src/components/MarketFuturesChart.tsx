import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, BaselineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { MarketDailyRecord } from '../api';
import { type ChartSyncController, UNIFIED_PRICE_SCALE_WIDTH } from '../utils/chartSync';

interface MarketFuturesChartProps {
  data: MarketDailyRecord[];
  initialVisibleBars?: number;
  syncController?: ChartSyncController;
  syncId?: string;
}

export const MarketFuturesChart: React.FC<MarketFuturesChartProps> = ({
  data,
  initialVisibleBars = 120,
  syncController,
  syncId = 'futures',
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const dataMapRef = useRef<Map<string, MarketDailyRecord>>(new Map());
  const prevDataLenRef = useRef<number>(0);
  const prevFirstDateRef = useRef<string>('');
  const prevLastDateRef = useRef<string>('');
  const hasInitializedRangeRef = useRef<boolean>(false);
  const isUpdatingSeriesRef = useRef<boolean>(false);

  const [hoveredData, setHoveredData] = useState<MarketDailyRecord | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  // 預先計算每一期的期貨 OI 較前期增減口數
  const diffMap = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < data.length; i++) {
      const cur = data[i].foreignFuturesOI ?? 0;
      const prev = i > 0 ? (data[i - 1].foreignFuturesOI ?? cur) : cur;
      m.set(data[i].date, cur - prev);
    }
    return m;
  }, [data]);

  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('theme-change', updateTheme);
    return () => {
      observer.disconnect();
      window.removeEventListener('theme-change', updateTheme);
    };
  }, []);

  // 1. 建立常駐 Chart 與 Series 實例
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDarkMode ? '#9ca3af' : '#64748b',
      },
      width: chartContainerRef.current.clientWidth,
      height: 200,
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

    // BaselineSeries: 以 0 為基準線，關閉右側浮動框避免遮擋
    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: 0 },
      topLineColor: '#ef4444',
      topFillColor1: 'rgba(239, 68, 68, 0.28)',
      topFillColor2: 'rgba(239, 68, 68, 0.05)',
      bottomLineColor: '#10b981',
      bottomFillColor1: 'rgba(16, 185, 129, 0.05)',
      bottomFillColor2: 'rgba(16, 185, 129, 0.28)',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (val: number) => `${Math.round(val ?? 0).toLocaleString()}`,
      },
    });

    // 0 口多空分界基準虛線（不佔用右側軸文字）
    series.createPriceLine({
      price: 0,
      color: '#9ca3af',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
    });

    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      if (syncController) return;
      if (!param.time || !param.seriesData.get(series)) {
        setHoveredData(null);
        return;
      }
      setHoveredData(dataMapRef.current.get(String(param.time)) || null);
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      seriesRef.current = null;
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch {}
        chartRef.current = null;
      }
    };
  }, []);

  // 2. 註冊至多圖表同步控制器
  useEffect(() => {
    if (!syncController || !chartRef.current) return;
    return syncController.register({
      id: syncId,
      chart: chartRef.current,
      getMainSeries: () => seriesRef.current,
      getValueAtTime: (timeStr) => dataMapRef.current.get(timeStr)?.foreignFuturesOI,
      onHoverTimeChange: (timeStr) => {
        setHoveredData(timeStr ? dataMapRef.current.get(timeStr) || null : null);
      },
      isUpdatingSeries: () => isUpdatingSeriesRef.current,
    });
  }, [syncController, syncId]);

  // 3. 主題深淺色更新
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

  // 4. 資料更新與時間軸區間同步
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || data.length === 0) return;

    const map = new Map<string, MarketDailyRecord>();
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
      const formatted = data.map((d) => ({
        time: d.date as Time,
        value: d.foreignFuturesOI,
      }));

      series.setData(formatted);

      if (isInitialLoad || (!isPrepended && !isSameDataset)) {
        const syncedRange = syncController?.getCurrentRange(datasetKey);
        if (syncedRange) {
          chart.timeScale().setVisibleLogicalRange(syncedRange);
          hasInitializedRangeRef.current = true;
        } else if (data.length > initialVisibleBars) {
          const targetRange = {
            from: data.length - initialVisibleBars,
            to: data.length - 1,
          };
          chart.timeScale().setVisibleLogicalRange(targetRange);
          syncController?.setCurrentRange(targetRange, datasetKey);
          hasInitializedRangeRef.current = true;
        } else {
          chart.timeScale().fitContent();
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
    } finally {
      isUpdatingSeriesRef.current = false;
    }
  }, [data, initialVisibleBars, syncController]);

  const activeDisplay = hoveredData || (data.length > 0 ? data[data.length - 1] : null);
  const activeDiff = activeDisplay ? (diffMap.get(activeDisplay.date) ?? 0) : 0;

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            ⚡ 外資台指期未平倉口數 (Net OI)
          </span>
          {/* 比照均線風格的頂部彩色圖例列 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium bg-gray-50 dark:bg-gray-900/60 px-2.5 py-1 rounded-lg border border-gray-100 dark:border-gray-700/60">
            <span className="inline-flex items-center gap-1.5 text-red-500">
              <span className="inline-block w-2.5 h-0.5 rounded-full bg-red-500" />
              淨多單 (&gt;0口)
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <span className="inline-block w-3 border-b-2 border-dotted border-gray-400" />
              零軸基準: 0口
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-500">
              <span className="inline-block w-2.5 h-0.5 rounded-full bg-emerald-500" />
              淨空單/避險 (&lt;0口)
            </span>
          </div>
        </div>

        {activeDisplay && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-gray-600 dark:text-gray-300">{activeDisplay.date}</span>
            <span>
              未平倉淨額：
              <strong
                className={
                  (activeDisplay.foreignFuturesOI ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'
                }
              >
                {(activeDisplay.foreignFuturesOI ?? 0) > 0 ? '+' : ''}
                {(activeDisplay.foreignFuturesOI ?? 0).toLocaleString()} 口
              </strong>
            </span>
            <span>
              當期增減：
              <strong className={activeDiff >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                {activeDiff > 0 ? '+' : ''}
                {activeDiff.toLocaleString()} 口
              </strong>
            </span>
          </div>
        )}
      </div>

      <div ref={chartContainerRef} className="w-full relative" />
    </div>
  );
};
