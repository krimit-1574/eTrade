/**
 * Technical Indicator Calculation Utilities
 * Calculates EMA, VWAP, and key horizontal levels for Lightweight Charts
 */

export function calculateEMA(data, period) {
  if (!Array.isArray(data) || !Number.isInteger(period) || period <= 0 || data.length < period) return [];
  if (data.some((candle) => !Number.isFinite(Number(candle?.close)))) return [];

  const k = 2 / (period + 1);
  const emaData = [];

  // Initial SMA as starting point for EMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += Number(data[i].close);
  }
  let prevEMA = sum / period;

  emaData.push({
    time: data[period - 1].time,
    value: parseFloat(prevEMA.toFixed(2)),
  });

  for (let i = period; i < data.length; i++) {
    const currentClose = Number(data[i].close);
    const currentEMA = (currentClose - prevEMA) * k + prevEMA;
    emaData.push({
      time: data[i].time,
      value: parseFloat(currentEMA.toFixed(2)),
    });
    prevEMA = currentEMA;
  }

  return emaData;
}

export function calculateIntradayVWAP(data) {
  if (!Array.isArray(data) || data.length === 0) return [];

  const vwapData = [];
  let cumTypicalVolume = 0;
  let cumVolume = 0;
  let currentDay = null;

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    const timestamp = typeof candle.time === 'number' ? candle.time * 1000 : new Date(candle.time).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const candleDay = new Date(timestamp).toISOString().slice(0, 10);

    // Reset cumulative sums on new trading day
    if (currentDay !== candleDay) {
      currentDay = candleDay;
      cumTypicalVolume = 0;
      cumVolume = 0;
    }

    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    const parsedVolume = Number(candle.volume);
    if (![high, low, close].every(Number.isFinite)) continue;
    const vol = Number.isFinite(parsedVolume) && parsedVolume > 0 ? parsedVolume : 0;
    const typicalPrice = (high + low + close) / 3;

    if (vol > 0) {
      cumTypicalVolume += typicalPrice * vol;
      cumVolume += vol;
    }

    const vwap = cumVolume > 0 ? cumTypicalVolume / cumVolume : close;

    vwapData.push({
      time: candle.time,
      value: parseFloat(vwap.toFixed(2)),
    });
  }

  return vwapData;
}

export function calculateKeyLevels(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      dayHigh: null,
      dayLow: null,
      prevDayHigh: null,
      prevDayLow: null,
      vwap: null,
    };
  }

  // Group by date
  const dayGroups = {};
  for (const candle of data) {
    const ts = typeof candle.time === 'number' ? candle.time * 1000 : new Date(candle.time).getTime();
    const high = Number(candle?.high);
    const low = Number(candle?.low);
    if (!Number.isFinite(ts) || !Number.isFinite(high) || !Number.isFinite(low)) continue;
    const dayStr = new Date(ts).toISOString().split('T')[0];
    if (!dayGroups[dayStr]) dayGroups[dayStr] = [];
    dayGroups[dayStr].push({ ...candle, high, low });
  }

  const sortedDays = Object.keys(dayGroups).sort();
  const currentDayCandles = dayGroups[sortedDays[sortedDays.length - 1]] || [];
  const prevDayCandles = sortedDays.length >= 2 ? dayGroups[sortedDays[sortedDays.length - 2]] : [];

  let dayHigh = null;
  let dayLow = null;
  if (currentDayCandles.length > 0) {
    dayHigh = Math.max(...currentDayCandles.map((c) => c.high));
    dayLow = Math.min(...currentDayCandles.map((c) => c.low));
  }

  let prevDayHigh = null;
  let prevDayLow = null;
  if (prevDayCandles.length > 0) {
    prevDayHigh = Math.max(...prevDayCandles.map((c) => c.high));
    prevDayLow = Math.min(...prevDayCandles.map((c) => c.low));
  }

  return {
    dayHigh: Number.isFinite(dayHigh) ? parseFloat(dayHigh.toFixed(2)) : null,
    dayLow: Number.isFinite(dayLow) ? parseFloat(dayLow.toFixed(2)) : null,
    prevDayHigh: Number.isFinite(prevDayHigh) ? parseFloat(prevDayHigh.toFixed(2)) : null,
    prevDayLow: Number.isFinite(prevDayLow) ? parseFloat(prevDayLow.toFixed(2)) : null,
  };
}
