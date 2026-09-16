/**
 * Technical Indicator Calculation Utilities
 * Calculates EMA, VWAP, and key horizontal levels for Lightweight Charts
 */

export function calculateEMA(data, period) {
  if (!data || data.length < period) return [];

  const k = 2 / (period + 1);
  const emaData = [];

  // Initial SMA as starting point for EMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let prevEMA = sum / period;

  emaData.push({
    time: data[period - 1].time,
    value: parseFloat(prevEMA.toFixed(2)),
  });

  for (let i = period; i < data.length; i++) {
    const currentClose = data[i].close;
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
  if (!data || data.length === 0) return [];

  const vwapData = [];
  let cumTypicalVolume = 0;
  let cumVolume = 0;
  let currentDay = null;

  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    const timestamp = typeof candle.time === 'number' ? candle.time * 1000 : new Date(candle.time).getTime();
    const candleDay = new Date(timestamp).toDateString();

    // Reset cumulative sums on new trading day
    if (currentDay !== candleDay) {
      currentDay = candleDay;
      cumTypicalVolume = 0;
      cumVolume = 0;
    }

    const high = candle.high;
    const low = candle.low;
    const close = candle.close;
    const vol = candle.volume || 1;
    const typicalPrice = (high + low + close) / 3;

    cumTypicalVolume += typicalPrice * vol;
    cumVolume += vol;

    const vwap = cumVolume > 0 ? cumTypicalVolume / cumVolume : close;

    vwapData.push({
      time: candle.time,
      value: parseFloat(vwap.toFixed(2)),
    });
  }

  return vwapData;
}

export function calculateKeyLevels(data) {
  if (!data || data.length === 0) {
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
    const dayStr = new Date(ts).toISOString().split('T')[0];
    if (!dayGroups[dayStr]) dayGroups[dayStr] = [];
    dayGroups[dayStr].push(candle);
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
    dayHigh: dayHigh ? parseFloat(dayHigh.toFixed(2)) : null,
    dayLow: dayLow ? parseFloat(dayLow.toFixed(2)) : null,
    prevDayHigh: prevDayHigh ? parseFloat(prevDayHigh.toFixed(2)) : null,
    prevDayLow: prevDayLow ? parseFloat(prevDayLow.toFixed(2)) : null,
  };
}
