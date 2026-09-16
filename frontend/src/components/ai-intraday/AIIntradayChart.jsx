import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  createChart, 
  CandlestickSeries, 
  HistogramSeries, 
  LineSeries,
  createSeriesMarkers
} from 'lightweight-charts';
import { Layers, Eye, EyeOff, RefreshCw, BarChart2 } from 'lucide-react';
import { calculateEMA, calculateIntradayVWAP, calculateKeyLevels } from '../../services/technicalCalculations';

const TIMEFRAMES = [
  { id: '1m', label: '1m', period: '1d', interval: '1m' },
  { id: '3m', label: '3m', period: '1d', interval: '3m' },
  { id: '5m', label: '5m', period: '5d', interval: '5m' },
  { id: '15m', label: '15m', period: '5d', interval: '15m' },
  { id: '30m', label: '30m', period: '1mo', interval: '30m' },
];

export default function AIIntradayChart({ 
  data = [], 
  isLoading = false,
  activeTimeframe = '5m',
  onTimeframeChange,
  markers = [],
  tradeLevels = null
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const vwapSeriesRef = useRef(null);
  const ema9SeriesRef = useRef(null);
  const ema20SeriesRef = useRef(null);
  const ema50SeriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const markersPluginRef = useRef(null);

  // Indicator Toggles
  const [indicators, setIndicators] = useState({
    vwap: true,
    ema9: true,
    ema20: true,
    ema50: false,
    levels: true,
    volume: true,
  });

  const toggleIndicator = (key) => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Format and sort candle data
  const formattedCandles = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data]
      .map((d) => ({
        time: d.time || d.date,
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseFloat(d.volume || 0),
      }))
      .sort((a, b) => {
        if (typeof a.time === 'number' && typeof b.time === 'number') return a.time - b.time;
        return new Date(a.time).getTime() - new Date(b.time).getTime();
      })
      .filter((v, i, a) => i === 0 || v.time !== a[i - 1].time);
  }, [data]);

  // Derived Indicator Data
  const indicatorData = useMemo(() => {
    if (formattedCandles.length === 0) return { vwap: [], ema9: [], ema20: [], ema50: [], levels: {}, volume: [] };

    const volume = formattedCandles.map((c) => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
    }));

    const vwap = calculateIntradayVWAP(formattedCandles);
    const ema9 = calculateEMA(formattedCandles, 9);
    const ema20 = calculateEMA(formattedCandles, 20);
    const ema50 = calculateEMA(formattedCandles, 50);
    const levels = calculateKeyLevels(formattedCandles);

    return { vwap, ema9, ema20, ema50, levels, volume };
  }, [formattedCandles]);

  // 1. Initialize Chart Instance ONCE on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 480,
      layout: {
        background: { color: 'transparent' },
        textColor: '#A1A1AA',
        fontFamily: 'Inter, -apple-system, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.22,
        },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(0, 240, 255, 0.4)', width: 1, style: 2, labelBackgroundColor: '#00F0FF' },
        horzLine: { color: 'rgba(0, 240, 255, 0.4)', width: 1, style: 2, labelBackgroundColor: '#00F0FF' },
      },
    });

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });
    candleSeriesRef.current = candleSeries;

    // 2. Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume_scale',
      visible: true,
    });
    chart.priceScale('volume_scale').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // 3. VWAP Line Series
    const vwapSeries = chart.addSeries(LineSeries, {
      color: '#F59E0B',
      lineWidth: 2,
      title: 'VWAP',
      visible: true,
      priceLineVisible: false,
    });
    vwapSeriesRef.current = vwapSeries;

    // 4. EMA 9 Line Series
    const ema9Series = chart.addSeries(LineSeries, {
      color: '#00F0FF',
      lineWidth: 1,
      title: 'EMA 9',
      visible: true,
      priceLineVisible: false,
    });
    ema9SeriesRef.current = ema9Series;

    // 5. EMA 20 Line Series
    const ema20Series = chart.addSeries(LineSeries, {
      color: '#B026FF',
      lineWidth: 1,
      title: 'EMA 20',
      visible: true,
      priceLineVisible: false,
    });
    ema20SeriesRef.current = ema20Series;

    // 6. EMA 50 Line Series
    const ema50Series = chart.addSeries(LineSeries, {
      color: '#3B82F6',
      lineWidth: 1,
      title: 'EMA 50',
      visible: false,
      priceLineVisible: false,
    });
    ema50SeriesRef.current = ema50Series;

    chartRef.current = chart;

    // Handle Window Resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []); // Run once on mount

  // 2. Performant Data Updates (Updates existing series without recreating the chart)
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    if (formattedCandles.length > 0) {
      candleSeriesRef.current.setData(formattedCandles);

      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(indicatorData.volume);
      }
      if (vwapSeriesRef.current) {
        vwapSeriesRef.current.setData(indicatorData.vwap);
      }
      if (ema9SeriesRef.current) {
        ema9SeriesRef.current.setData(indicatorData.ema9);
      }
      if (ema20SeriesRef.current) {
        ema20SeriesRef.current.setData(indicatorData.ema20);
      }
      if (ema50SeriesRef.current) {
        ema50SeriesRef.current.setData(indicatorData.ema50);
      }

      // Markers (v5 createSeriesMarkers support)
      if (candleSeriesRef.current) {
        if (typeof candleSeriesRef.current.setMarkers === 'function') {
          candleSeriesRef.current.setMarkers(markers || []);
        } else if (typeof createSeriesMarkers === 'function') {
          try {
            if (!markersPluginRef.current) {
              markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markers || []);
            } else {
              markersPluginRef.current.setMarkers(markers || []);
            }
          } catch (e) {
            console.warn('Could not set chart markers', e);
          }
        }
      }

      // Update Horizontal Key Price Levels
      if (priceLinesRef.current.length > 0) {
        priceLinesRef.current.forEach((line) => {
          try {
            candleSeriesRef.current.removePriceLine(line);
          } catch (_) {}
        });
        priceLinesRef.current = [];
      }

      // Render Trade Plan / Active Position Price Lines (Entry, SL, T1, T2)
      if (tradeLevels && candleSeriesRef.current) {
        const { entry, stopLoss, target1, target2, direction } = tradeLevels;

        if (entry && entry > 0) {
          const entryLine = candleSeriesRef.current.createPriceLine({
            price: entry,
            color: '#00F0FF',
            lineWidth: 2,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: `ENTRY: ₹${entry}`,
          });
          priceLinesRef.current.push(entryLine);
        }

        if (stopLoss && stopLoss > 0) {
          const slLine = candleSeriesRef.current.createPriceLine({
            price: stopLoss,
            color: '#EF4444',
            lineWidth: 2,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: `SL: ₹${stopLoss}`,
          });
          priceLinesRef.current.push(slLine);
        }

        if (target1 && target1 > 0) {
          const t1Line = candleSeriesRef.current.createPriceLine({
            price: target1,
            color: '#10B981',
            lineWidth: 2,
            lineStyle: 1, // Dotted
            axisLabelVisible: true,
            title: `T1: ₹${target1}`,
          });
          priceLinesRef.current.push(t1Line);
        }

        if (target2 && target2 > 0) {
          const t2Line = candleSeriesRef.current.createPriceLine({
            price: target2,
            color: '#059669',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `T2: ₹${target2}`,
          });
          priceLinesRef.current.push(t2Line);
        }
      }

      if (indicators.levels && indicatorData.levels) {
        const { dayHigh, dayLow, prevDayHigh, prevDayLow } = indicatorData.levels;

        if (dayHigh) {
          const line = candleSeriesRef.current.createPriceLine({
            price: dayHigh,
            color: '#10B981',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: 'DH',
          });
          priceLinesRef.current.push(line);
        }

        if (dayLow) {
          const line = candleSeriesRef.current.createPriceLine({
            price: dayLow,
            color: '#EF4444',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: 'DL',
          });
          priceLinesRef.current.push(line);
        }

        if (prevDayHigh) {
          const line = candleSeriesRef.current.createPriceLine({
            price: prevDayHigh,
            color: 'rgba(52, 211, 153, 0.6)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'PDH',
          });
          priceLinesRef.current.push(line);
        }

        if (prevDayLow) {
          const line = candleSeriesRef.current.createPriceLine({
            price: prevDayLow,
            color: 'rgba(248, 113, 113, 0.6)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: 'PDL',
          });
          priceLinesRef.current.push(line);
        }
      }

      chartRef.current.timeScale().fitContent();
    }
  }, [formattedCandles, indicatorData, indicators.levels, markers, tradeLevels]);

  // 3. Indicator Visibility Updates
  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: indicators.volume });
    }
    if (vwapSeriesRef.current) {
      vwapSeriesRef.current.applyOptions({ visible: indicators.vwap });
    }
    if (ema9SeriesRef.current) {
      ema9SeriesRef.current.applyOptions({ visible: indicators.ema9 });
    }
    if (ema20SeriesRef.current) {
      ema20SeriesRef.current.applyOptions({ visible: indicators.ema20 });
    }
    if (ema50SeriesRef.current) {
      ema50SeriesRef.current.applyOptions({ visible: indicators.ema50 });
    }
  }, [indicators]);

  return (
    <div className="card intraday-chart-wrapper" style={{ padding: '0', overflow: 'hidden' }}>
      {/* Chart Toolbar */}
      <div className="chart-toolbar flex-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(10, 10, 18, 0.7)', flexWrap: 'wrap', gap: '12px' }}>
        {/* Timeframe Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', marginRight: '4px' }}>
            TIMEFRAME:
          </span>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              className={`tf-btn ${activeTimeframe === tf.id ? 'active' : ''}`}
              onClick={() => onTimeframeChange && onTimeframeChange(tf.id)}
              disabled={isLoading}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Technical Indicator Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Layers size={13} /> INDICATORS:
          </span>

          <button
            className={`indicator-toggle-btn ${indicators.vwap ? 'active' : ''}`}
            onClick={() => toggleIndicator('vwap')}
            style={{ color: indicators.vwap ? '#F59E0B' : 'var(--text-muted)' }}
          >
            <span className="dot" style={{ background: '#F59E0B' }} />
            VWAP
          </button>

          <button
            className={`indicator-toggle-btn ${indicators.ema9 ? 'active' : ''}`}
            onClick={() => toggleIndicator('ema9')}
            style={{ color: indicators.ema9 ? '#00F0FF' : 'var(--text-muted)' }}
          >
            <span className="dot" style={{ background: '#00F0FF' }} />
            EMA 9
          </button>

          <button
            className={`indicator-toggle-btn ${indicators.ema20 ? 'active' : ''}`}
            onClick={() => toggleIndicator('ema20')}
            style={{ color: indicators.ema20 ? '#B026FF' : 'var(--text-muted)' }}
          >
            <span className="dot" style={{ background: '#B026FF' }} />
            EMA 20
          </button>

          <button
            className={`indicator-toggle-btn ${indicators.ema50 ? 'active' : ''}`}
            onClick={() => toggleIndicator('ema50')}
            style={{ color: indicators.ema50 ? '#3B82F6' : 'var(--text-muted)' }}
          >
            <span className="dot" style={{ background: '#3B82F6' }} />
            EMA 50
          </button>

          <button
            className={`indicator-toggle-btn ${indicators.levels ? 'active' : ''}`}
            onClick={() => toggleIndicator('levels')}
          >
            <span className="dot" style={{ background: '#10B981' }} />
            Key Levels
          </button>
        </div>
      </div>

      {/* Candlestick Canvas Container */}
      <div style={{ position: 'relative', width: '100%', minHeight: '480px' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(5, 5, 8, 0.75)',
              backdropFilter: 'blur(3px)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            <RefreshCw size={24} className="spin-anim" style={{ color: 'var(--neon-cyan)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--neon-cyan)' }}>
              Loading real-time OHLCV candles...
            </span>
          </div>
        )}

        {!isLoading && formattedCandles.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              color: 'var(--text-muted)',
            }}
          >
            <BarChart2 size={32} opacity={0.4} />
            <span style={{ fontSize: '0.9rem' }}>No intraday candle data available for this timeframe or symbol.</span>
            <span style={{ fontSize: '0.75rem' }}>Try switching to 5m or 15m timeframe.</span>
          </div>
        )}

        <div ref={containerRef} className="ai-chart-canvas" style={{ width: '100%', height: '480px' }} />
      </div>
    </div>
  );
}
