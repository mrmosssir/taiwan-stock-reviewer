import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { MarketDailyRecord } from '../api';
import { type ChartSyncController, UNIFIED_PRICE_SCALE_WIDTH } from '../utils/chartSync';

interface MarketInstChartProps {
  data: MarketDailyRecord[];
  initialVisibleBars?: number;
  syncController?: ChartSyncController;
  syncId?: string;
}

export const MarketInstChart: React.FC<MarketInstChartProps> = ({
  data,
  initialVisibleBars = 120,
  syncController,
  syncId = 'inst',
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const dataMapRef = useRef<Map<string, MarketDailyRecord>>(new Map());
  const selectedInstRef = useRef<'foreign' | 'trust' | 'dealer' | 'total'>('total');
  const prevDataLenRef = useRef<number>(0);
  const prevFirstDateRef = useRef<string>('');
  const prevLastDateRef = useRef<string>('');
  const hasInitializedRangeRef = useRef<boolean>(false);
  const isUpdatingSeriesRef = useRef<boolean>(false);

  const [selectedInst, setSelectedInst] = useState<'foreign' | 'trust' | 'dealer' | 'total'>('total');
  const [hoveredData, setHoveredData] = useState<MarketDailyRecord | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    selectedInstRef.current = selectedInst;
  }, [selectedInst]);

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

  const getInstValueInBillion = (d: MarketDailyRecord, instType: 'foreign' | 'trust' | 'dealer' | 'total') => {
    let val = d.totalInstNet;
    if (instType === 'foreign') val = d.foreignNet;
    if (instType === 'trust') val = d.trustNet;
    if (instType === 'dealer') val = d.dealerNet;
    return val / 1e8;
  };

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

    const series = chart.addSeries(HistogramSeries, {
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (val: number) => `${(val ?? 0).toFixed(0)}`,
      },
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
      getValueAtTime: (timeStr) => {
        const record = dataMapRef.current.get(timeStr);
        if (!record) return undefined;
        return getInstValueInBillion(record, selectedInstRef.current);
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

  // 4. 資料與法人類別切換更新 (保留時間軸滾動位置)
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
      const formatted = data.map((d) => {
        const valInBillion = getInstValueInBillion(d, selectedInst);
        return {
          time: d.date as Time,
          value: valInBillion,
          color: valInBillion >= 0 ? '#ef4444' : '#10b981', // 買超紅，賣超綠
        };
      });

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
  }, [data, selectedInst, initialVisibleBars, syncController]);

  const activeDisplay = hoveredData || (data.length > 0 ? data[data.length - 1] : null);

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            🏢 三大法人買賣超 (億元)
          </span>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setSelectedInst('total')}
              className={`px-2 py-1 rounded-md transition-colors ${
                selectedInst === 'total'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              合計
            </button>
            <button
              onClick={() => setSelectedInst('foreign')}
              className={`px-2 py-1 rounded-md transition-colors ${
                selectedInst === 'foreign'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              外資
            </button>
            <button
              onClick={() => setSelectedInst('trust')}
              className={`px-2 py-1 rounded-md transition-colors ${
                selectedInst === 'trust'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              投信
            </button>
            <button
              onClick={() => setSelectedInst('dealer')}
              className={`px-2 py-1 rounded-md transition-colors ${
                selectedInst === 'dealer'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              自營商
            </button>
          </div>

          {/* 彩色圖例標示 */}
          <div className="flex items-center gap-x-2.5 text-xs font-medium bg-gray-50 dark:bg-gray-900/60 px-2.5 py-1 rounded-lg border border-gray-100 dark:border-gray-700/60">
            <span className="inline-flex items-center gap-1 text-red-500">
              <span className="inline-block w-2 h-2 rounded-xs bg-red-500" />
              買超 (&gt;0)
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-500">
              <span className="inline-block w-2 h-2 rounded-xs bg-emerald-500" />
              賣超 (&lt;0)
            </span>
          </div>
        </div>

        {activeDisplay && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-gray-600 dark:text-gray-300">{activeDisplay.date}</span>
            <span>
              合計{' '}
              <strong className={(activeDisplay.totalInstNet ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                {(activeDisplay.totalInstNet ?? 0) >= 0 ? '+' : ''}
                {((activeDisplay.totalInstNet ?? 0) / 1e8).toFixed(1)}億
              </strong>
            </span>
            <span>
              外資{' '}
              <strong className={(activeDisplay.foreignNet ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                {(activeDisplay.foreignNet ?? 0) >= 0 ? '+' : ''}
                {((activeDisplay.foreignNet ?? 0) / 1e8).toFixed(1)}億
              </strong>
            </span>
            <span>
              投信{' '}
              <strong className={(activeDisplay.trustNet ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                {(activeDisplay.trustNet ?? 0) >= 0 ? '+' : ''}
                {((activeDisplay.trustNet ?? 0) / 1e8).toFixed(1)}億
              </strong>
            </span>
            <span>
              自營{' '}
              <strong className={(activeDisplay.dealerNet ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                {(activeDisplay.dealerNet ?? 0) >= 0 ? '+' : ''}
                {((activeDisplay.dealerNet ?? 0) / 1e8).toFixed(1)}億
              </strong>
            </span>
          </div>
        )}
      </div>

      <div ref={chartContainerRef} className="w-full relative" />
    </div>
  );
};
