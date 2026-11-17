import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { MarketDailyRecord } from '../api';
import { type ChartSyncController, UNIFIED_PRICE_SCALE_WIDTH } from '../utils/chartSync';

interface MarketMarginBalanceChartProps {
  data: MarketDailyRecord[];
  initialVisibleBars?: number;
  syncController?: ChartSyncController;
  syncId?: string;
}

export const MarketMarginBalanceChart: React.FC<MarketMarginBalanceChartProps> = ({
  data,
  initialVisibleBars = 120,
  syncController,
  syncId = 'margin',
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
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

    // 融資餘額 (轉成億元) — 關閉右側文字框，改由上方彩色圖例列呈現
    const marginSeries = chart.addSeries(LineSeries, {
      color: '#f97316', // Orange
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (val: number) => `${(val ?? 0).toFixed(0)}`,
      },
    });

    seriesRef.current = marginSeries;

    chart.subscribeCrosshairMove((param) => {
      if (syncController) return;
      if (!param.time || !param.seriesData.get(marginSeries)) {
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
      getValueAtTime: (timeStr) => {
        const record = dataMapRef.current.get(timeStr);
        return record !== undefined ? record.marginBalance / 1e5 : undefined;
      },
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
      const marginData = data.map((d) => ({
        time: d.date as Time,
        value: d.marginBalance / 1e5, // 仟元轉億元
      }));

      series.setData(marginData);

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
            👥 大盤融資餘額趨勢 (散戶動向)
          </span>
          {/* 比照均線風格的頂部彩色圖例與數值解釋列 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium bg-gray-50 dark:bg-gray-900/60 px-2.5 py-1 rounded-lg border border-gray-100 dark:border-gray-700/60">
            <span className="inline-flex items-center gap-1.5" style={{ color: '#f97316' }}>
              <span className="inline-block w-2.5 h-0.5 rounded-full" style={{ backgroundColor: '#f97316' }} />
              融資餘額 (億元)
            </span>
            <span className="text-red-500">▲ 資增 (注意過熱)</span>
            <span className="text-emerald-500">▼ 資減 (浮額清洗)</span>
          </div>
        </div>

        {activeDisplay && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-gray-600 dark:text-gray-300">{activeDisplay.date}</span>
            <span style={{ color: '#f97316' }}>
              融資餘額：<strong>{((activeDisplay.marginBalance ?? 0) / 1e5).toFixed(1)} 億</strong>
            </span>
            <span>
              當期增減：
              <strong className={(activeDisplay.marginDiff ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                {(activeDisplay.marginDiff ?? 0) >= 0 ? '+' : ''}
                {((activeDisplay.marginDiff ?? 0) / 1e5).toFixed(2)} 億
              </strong>
            </span>
            <span>
              融券餘額：<strong>{(activeDisplay.shortBalance ?? 0).toLocaleString()} 張</strong>
            </span>
          </div>
        )}
      </div>

      <div ref={chartContainerRef} className="w-full relative" />
    </div>
  );
};
