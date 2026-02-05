import React, { useEffect, useRef } from 'react';
import { 
  createChart, 
  ColorType, 
  CandlestickSeries, 
  LineSeries, 
  HistogramSeries 
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
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
  onLoadMore?: () => void;
}

export const KLineChart: React.FC<KLineChartProps> = ({ data, indicators, onLoadMore }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const isLoadingMoreRef = useRef(false);

  // Initial Chart Creation
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: chartContainerRef.current.clientWidth,
      height: 460,
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      timeScale: {
        borderColor: '#e1e1e1',
        timeVisible: true,
        fixRightEdge: true,
      },
    });

    chartRef.current = chart;

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && range.from < 0 && !isLoadingMoreRef.current && onLoadMore) {
        isLoadingMoreRef.current = true;
        onLoadMore();
        setTimeout(() => {
          isLoadingMoreRef.current = false;
        }, 1000); 
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
      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch (e) {}
        chartRef.current = null;
      }
    };
  }, []);

  // Update Data and Indicators
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;

    const activeSeries: ISeriesApi<any>[] = [];

    try {
      // --- Volume Series (Add first so it stays at back) ---
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // Overlay on main scale
      });
      
      // Set volume scale margins to keep it at bottom
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      volumeSeries.setData(data.map(d => ({
        time: d.date as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.5)',
      })));
      activeSeries.push(volumeSeries);

      // --- Main Series: Candlestick ---
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#ef4444', 
        downColor: '#22c55e', 
        borderVisible: false,
        wickUpColor: '#ef4444',
        wickDownColor: '#22c55e',
      });
      
      // Ensure candlestick has its own scale margins to not overlap volume too much
      candlestickSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      });

      candlestickSeries.setData(data.map(d => ({
        time: d.date as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })));
      activeSeries.push(candlestickSeries);

      if (data.length < 200 && !isLoadingMoreRef.current) {
         chart.timeScale().fitContent();
      }

      // Indicators (MA, BB, MACD logic same as before but safe with series management)
      if (indicators.ma) {
        const closePrices = data.map(d => d.close);
        [5, 20, 60].forEach((period, idx) => {
          const colors = ['#f59e0b', '#8b5cf6', '#3b82f6'];
          const maValues = SMA.calculate({ period, values: closePrices });
          if (maValues && maValues.length > 0) {
            const series = chart.addSeries(LineSeries, { color: colors[idx], lineWidth: 1, title: `MA${period}` });
            const diff = data.length - maValues.length;
            series.setData(maValues.map((v, i) => ({ time: data[i + diff].date as Time, value: v })));
            activeSeries.push(series);
          }
        });
      }

      if (indicators.bollinger) {
        const closePrices = data.map(d => d.close);
        const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closePrices });
        if (bb && bb.length > 0) {
          const diff = data.length - bb.length;
          const u = chart.addSeries(LineSeries, { color: 'rgba(4, 111, 232, 0.2)', lineWidth: 1 });
          const l = chart.addSeries(LineSeries, { color: 'rgba(4, 111, 232, 0.2)', lineWidth: 1 });
          const m = chart.addSeries(LineSeries, { color: 'rgba(4, 111, 232, 0.4)', lineWidth: 1, lineStyle: 2 });
          u.setData(bb.map((v, i) => ({ time: data[i + diff].date as Time, value: v.upper })));
          l.setData(bb.map((v, i) => ({ time: data[i + diff].date as Time, value: v.lower })));
          m.setData(bb.map((v, i) => ({ time: data[i + diff].date as Time, value: v.middle })));
          activeSeries.push(u, l, m);
        }
      }

      if (indicators.macd) {
        const closePrices = data.map(d => d.close);
        const macdData = MACD.calculate({ values: closePrices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
        if (macdData && macdData.length > 0) {
          const diff = data.length - macdData.length;
          chart.priceScale('left').applyOptions({ visible: true, scaleMargins: { top: 0.8, bottom: 0 } });
          const hist = chart.addSeries(HistogramSeries, { color: '#2962FF', priceScaleId: 'left' });
          const sig = chart.addSeries(LineSeries, { color: '#FF6D00', lineWidth: 1, priceScaleId: 'left' });
          hist.setData(macdData.map((v, i) => ({ time: data[i + diff].date as Time, value: v.MACD || 0, color: (v.MACD || 0) > 0 ? '#ef4444' : '#22c55e' })));
          sig.setData(macdData.map((v, i) => ({ time: data[i + diff].date as Time, value: v.signal || 0 })));
          activeSeries.push(hist, sig);
        }
      }

    } catch (e) {
      console.error('Error adding series:', e);
    }

    return () => {
      if (chartRef.current === chart) {
        activeSeries.forEach(s => {
          try { chart.removeSeries(s); } catch (e) {}
        });
        try {
          chart.priceScale('left').applyOptions({ visible: false });
        } catch (e) {}
      }
    };
  }, [data, indicators]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
};
