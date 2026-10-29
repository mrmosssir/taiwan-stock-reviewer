import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, Time } from 'lightweight-charts';
import type { MarketDailyRecord } from '../api';

interface MarketInstChartProps {
  data: MarketDailyRecord[];
}

export const MarketInstChart: React.FC<MarketInstChartProps> = ({ data }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [selectedInst, setSelectedInst] = useState<'foreign' | 'trust' | 'dealer' | 'total'>('total');
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

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
      },
    });

    chartRef.current = chart;

    const series = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'custom',
        formatter: (val: number) => `${(val ?? 0).toFixed(1)} 億`,
      },
    });

    const formatted = data.map((d) => {
      let val = d.totalInstNet;
      if (selectedInst === 'foreign') val = d.foreignNet;
      if (selectedInst === 'trust') val = d.trustNet;
      if (selectedInst === 'dealer') val = d.dealerNet;

      const valInBillion = val / 1e8;
      return {
        time: d.date as Time,
        value: valInBillion,
        color: valInBillion >= 0 ? '#ef4444' : '#10b981', // 買超紅，賣超綠
      };
    });

    series.setData(formatted);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data, selectedInst, isDarkMode]);

  const latest = data[data.length - 1];

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
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
        </div>

        {latest && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500 dark:text-gray-400">當日：</span>
            <span>外資 <strong className={(latest.foreignNet ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>{((latest.foreignNet ?? 0) / 1e8).toFixed(1)}億</strong></span>
            <span>投信 <strong className={(latest.trustNet ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>{((latest.trustNet ?? 0) / 1e8).toFixed(1)}億</strong></span>
            <span>自營 <strong className={(latest.dealerNet ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>{((latest.dealerNet ?? 0) / 1e8).toFixed(1)}億</strong></span>
          </div>
        )}
      </div>

      <div ref={chartContainerRef} className="w-full relative" />
    </div>
  );
};
