import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, BaselineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, Time } from 'lightweight-charts';
import type { MarketDailyRecord } from '../api';

interface MarketScoreChartProps {
  data: MarketDailyRecord[];
}

export const MarketScoreChart: React.FC<MarketScoreChartProps> = ({ data }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [hoveredData, setHoveredData] = useState<MarketDailyRecord | null>(null);
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

    // 清除舊圖表
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
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
    });

    chartRef.current = chart;

    // 自訂多空分數走勢 (BaselineSeries: 以 50 分為多空中線)
    const series = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: 50 },
      topLineColor: '#ef4444',
      topFillColor1: 'rgba(239, 68, 68, 0.32)',
      topFillColor2: 'rgba(239, 68, 68, 0.05)',
      bottomLineColor: '#10b981',
      bottomFillColor1: 'rgba(16, 185, 129, 0.05)',
      bottomFillColor2: 'rgba(16, 185, 129, 0.32)',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${(price ?? 0).toFixed(0)} 分`,
      },
    });

    const formattedData = data.map((d) => ({
      time: d.date as Time,
      value: d.score,
    }));

    series.setData(formattedData);

    // 標註 65 分 (多頭門檻) 參考線
    series.createPriceLine({
      price: 65,
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '多頭 65',
    });

    // 標註 50 分 (多空中線) 參考線
    series.createPriceLine({
      price: 50,
      color: isDarkMode ? '#6b7280' : '#9ca3af',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: '中線 50',
    });

    // 標註 35 分 (空頭警戒) 參考線
    series.createPriceLine({
      price: 35,
      color: '#10b981',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '空頭 35',
    });

    // 監聽十字準心 Crosshair
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.get(series)) {
        setHoveredData(null);
        return;
      }
      const match = data.find((d) => d.date === param.time);
      setHoveredData(match || null);
    });

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

  const activeDisplay = hoveredData || (data.length > 0 ? data[data.length - 1] : null);

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            🎯 自訂大盤多空分數走勢 (0 ~ 100 分)
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            (≥65分多頭、≤35分空頭、中間區間震盪)
          </span>
        </div>

        {activeDisplay && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500 dark:text-gray-400">{activeDisplay.date}</span>
            <span className="font-bold text-gray-900 dark:text-gray-100">
              得分：{activeDisplay.score} 分
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
          💡 <span className="font-medium text-gray-800 dark:text-gray-200">當日因子評析：</span> {activeDisplay.summary}
        </div>
      )}
    </div>
  );
};
