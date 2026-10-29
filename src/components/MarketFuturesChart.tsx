import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, BaselineSeries } from 'lightweight-charts';
import type { IChartApi, Time } from 'lightweight-charts';
import type { MarketDailyRecord } from '../api';

interface MarketFuturesChartProps {
  data: MarketDailyRecord[];
}

export const MarketFuturesChart: React.FC<MarketFuturesChartProps> = ({ data }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
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

    // BaselineSeries: 以 0 為基準線
    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: 0 },
      topLineColor: '#ef4444',
      topFillColor1: 'rgba(239, 68, 68, 0.28)',
      topFillColor2: 'rgba(239, 68, 68, 0.05)',
      bottomLineColor: '#10b981',
      bottomFillColor1: 'rgba(16, 185, 129, 0.05)',
      bottomFillColor2: 'rgba(16, 185, 129, 0.28)',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (val: number) => `${(val ?? 0).toLocaleString()} 口`,
      },
    });

    const formatted = data.map((d) => ({
      time: d.date as Time,
      value: d.foreignFuturesOI,
    }));

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
  }, [data, isDarkMode]);

  const latest = data[data.length - 1];

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            ⚡ 外資台指期未平倉口數 (Net OI)
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            (&gt;0 淨多單，&lt;0 淨空單/避險)
          </span>
        </div>

        {latest && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400">最新未平倉：</span>
            <span
              className={`font-bold ${
                (latest.foreignFuturesOI ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'
              }`}
            >
              {(latest.foreignFuturesOI ?? 0) > 0 ? '+' : ''}
              {(latest.foreignFuturesOI ?? 0).toLocaleString()} 口
            </span>
          </div>
        )}
      </div>

      <div ref={chartContainerRef} className="w-full relative" />
    </div>
  );
};
