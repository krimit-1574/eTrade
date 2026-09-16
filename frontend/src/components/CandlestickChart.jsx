import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';

export default function CandlestickChart({ data }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const isIntraday = data.some(d => typeof d.time === 'number');

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 520,
      layout: {
        background: { color: 'transparent' },
        textColor: '#A1A1AA',
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(0, 240, 255, 0.05)' },
        horzLines: { color: 'rgba(0, 240, 255, 0.05)' },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: isIntraday,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(0, 240, 255, 0.5)', width: 1, style: 2, labelBackgroundColor: '#00F0FF' },
        horzLine: { color: 'rgba(0, 240, 255, 0.5)', width: 1, style: 2, labelBackgroundColor: '#00F0FF' },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    const formatted = [...data]
      .map((d) => ({
        time: d.time || d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      .sort((a, b) => {
        if (typeof a.time === 'number' && typeof b.time === 'number') return a.time - b.time;
        return new Date(a.time).getTime() - new Date(b.time).getTime();
      })
      .filter((v, i, a) => i === 0 || v.time !== a[i - 1].time);

    series.setData(formatted);
    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  return <div ref={containerRef} className="chart-container" />;
}
