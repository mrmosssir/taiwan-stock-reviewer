import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';
import type { IChartApi, Time } from 'lightweight-charts';
import type { MarketDailyRecord } from '../api';

interface MarketMarginBalanceChartProps {
  data: MarketDailyRecord[];
}

export const MarketMarginBalanceChart: React.FC<MarketMarginBalanceChartProps> = ({ data }) => {
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

    // 融資餘額 (轉成億元)
    const marginSeries = chart.addSeries(LineSeries, {
      color: '#f97316', // Orange
      lineWidth: 2,
      title: '融資 (億)',
      priceFormat: {
        type: 'custom',
        formatter: (val: number) => `${(val ?? 0).toFixed(1)} 億`,
      },
    });

    const marginData = data.map((d) => ({
      time: d.date as Time,
      value: d.marginBalance / 1e5, // 仟元轉億元
    }));

    marginSeries.setData(marginData);
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
            👥 大盤融資餘額趨勢 (散戶動向)
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            (融資大增注意過熱，融資急降浮額清洗)
          </span>
        </div>

        {latest && (
          <div className="flex items-center gap-3 text-xs">
            <span>
              融資餘額：<strong>{((latest.marginBalance ?? 0) / 1e5).toFixed(1)} 億</strong>
            </span>
            <span>
              今日增減：
              <strong className={(latest.marginDiff ?? 0) >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                {(latest.marginDiff ?? 0) >= 0 ? '+' : ''}
                {((latest.marginDiff ?? 0) / 1e5).toFixed(2)} 億
              </strong>
            </span>
            <span>
              融券餘額：<strong>{(latest.shortBalance ?? 0).toLocaleString()} 張</strong>
            </span>
          </div>
        )}
      </div>

      <div ref={chartContainerRef} className="w-full relative" />
    </div>
  );
};
