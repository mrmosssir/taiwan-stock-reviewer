import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, BaselineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { MarketDailyRecord } from '../api';
import { type ChartSyncController, UNIFIED_PRICE_SCALE_WIDTH } from '../utils/chartSync';

interface MarketScoreChartProps {
  data: MarketDailyRecord[];
  initialVisibleBars?: number;
  syncController?: ChartSyncController;
  syncId?: string;
}

export const MarketScoreChart: React.FC<MarketScoreChartProps> = ({
  data,
  initialVisibleBars = 120,
  syncController,
  syncId = 'score',
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
      height: 220,
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
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
    });

    chartRef.current = chart;

    // 自訂多空分數走勢 (BaselineSeries: 以 50 分為多空中線，關閉右側浮動標籤避免遮擋)
    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: 50 },
      topLineColor: '#ef4444',
      topFillColor1: 'rgba(239, 68, 68, 0.32)',
      topFillColor2: 'rgba(239, 68, 68, 0.05)',
      bottomLineColor: '#10b981',
      bottomFillColor1: 'rgba(16, 185, 129, 0.05)',
      bottomFillColor2: 'rgba(16, 185, 129, 0.32)',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${(price ?? 0).toFixed(0)}`,
      },
    });

    seriesRef.current = series;

    // 標註 65 分 (多頭門檻) 參考線 — 僅繪製圖中虛線，文字解釋移至頂部彩色圖例列
    series.createPriceLine({
      price: 65,
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
    });

    // 標註 50 分 (多空中線) 參考線
    series.createPriceLine({
      price: 50,
      color: '#9ca3af',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: false,
    });

    // 標註 35 分 (空頭警戒) 參考線
    series.createPriceLine({
      price: 35,
      color: '#10b981',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
    });

    // 若未使用外部 syncController 時的本地 Crosshair 監聽
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
      getValueAtTime: (timeStr) => dataMapRef.current.get(timeStr)?.score,
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
      const formattedData = data.map((d) => ({
        time: d.date as Time,
        value: d.score,
      }));

      series.setData(formattedData);

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

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            🎯 自訂大盤多空分數走勢
          </span>
          {/* 比照均線風格的頂部彩色門檻圖例列 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium bg-gray-50 dark:bg-gray-900/60 px-2.5 py-1 rounded-lg border border-gray-100 dark:border-gray-700/60">
            <span className="inline-flex items-center gap-1.5 text-red-500">
              <span className="inline-block w-3 border-b-2 border-dashed border-red-500" />
              多頭門檻: <strong>≥65分</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <span className="inline-block w-3 border-b-2 border-dotted border-gray-400" />
              多空中線: <strong>50分</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-500">
              <span className="inline-block w-3 border-b-2 border-dashed border-emerald-500" />
              空頭警戒: <strong>≤35分</strong>
            </span>
          </div>
        </div>

        {activeDisplay && (
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-gray-600 dark:text-gray-300">{activeDisplay.date}</span>
            <span
              className={`font-bold ${
                activeDisplay.score >= 65
                  ? 'text-red-500'
                  : activeDisplay.score <= 35
                  ? 'text-emerald-500'
                  : 'text-amber-500'
              }`}
            >
              當期得分：{activeDisplay.score} 分
            </span>
            <span
              className={`px-2 py-0.5 rounded font-medium text-white ${
                activeDisplay.status === 'bull'
                  ? 'bg-red-500'
                  : activeDisplay.status === 'bear'
                  ? 'bg-emerald-600'
                  : 'bg-amber-500'
              }`}
            >
              {activeDisplay.statusText}
            </span>
          </div>
        )}
      </div>

      <div ref={chartContainerRef} className="w-full relative" />

      {activeDisplay?.summary && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
          💡 <span className="font-medium text-gray-800 dark:text-gray-200">當期因子評析：</span> {activeDisplay.summary}
        </div>
      )}
    </div>
  );
};
