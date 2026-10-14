/**
 * IndicatorEngine.js
 * Pure functions to calculate technical indicators from OHLCV data.
 * Does not execute trades. Handles insufficient data gracefully.
 */

export const IndicatorEngine = {
  /**
   * Calculates Simple Moving Average (SMA).
   */
  SMA(data, period) {
    if (!data || data.length < period) return null;
    const slice = data.slice(-period);
    const sum = slice.reduce((acc, val) => acc + val.close, 0);
    return sum / period;
  },

  /**
   * Calculates Exponential Moving Average (EMA).
   */
  EMA(data, period) {
    if (!data || data.length < period) return null;
    const k = 2 / (period + 1);
    
    // Start with SMA for the first 'period' candles
    let ema = data.slice(0, period).reduce((acc, val) => acc + val.close, 0) / period;
    
    // Calculate EMA for the rest
    for (let i = period; i < data.length; i++) {
      ema = (data[i].close - ema) * k + ema;
    }
    return ema;
  },

  /**
   * Calculates Relative Strength Index (RSI).
   */
  RSI(data, period = 14) {
    if (!data || data.length <= period) return null;

    let gains = 0;
    let losses = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const change = data[i].close - data[i - 1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Smoothed RSI for the remaining data
    for (let i = period + 1; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }

    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  },

  /**
   * Calculates Average True Range (ATR).
   */
  ATR(data, period = 14) {
    if (!data || data.length <= period) return null;

    const trueRanges = [];
    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // Initial ATR (SMA of TR)
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // Smoothed ATR
    for (let i = period; i < trueRanges.length; i++) {
      atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    }
    return atr;
  },

  /**
   * Calculates MACD (Moving Average Convergence Divergence).
   */
  MACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!data || data.length < slowPeriod + signalPeriod) return null;

    // Calculate fast and slow EMAs for the entire series
    const kFast = 2 / (fastPeriod + 1);
    const kSlow = 2 / (slowPeriod + 1);
    
    let fastEma = data.slice(0, fastPeriod).reduce((a, b) => a + b.close, 0) / fastPeriod;
    let slowEma = data.slice(0, slowPeriod).reduce((a, b) => a + b.close, 0) / slowPeriod;
    
    const macdLine = [];
    
    // Fast EMA array (padding start)
    const fastEmas = new Array(fastPeriod - 1).fill(0);
    fastEmas.push(fastEma);
    for (let i = fastPeriod; i < data.length; i++) {
      fastEma = (data[i].close - fastEma) * kFast + fastEma;
      fastEmas.push(fastEma);
    }
    
    // Slow EMA and MACD Line calculation
    for (let i = slowPeriod; i < data.length; i++) {
       slowEma = (data[i].close - slowEma) * kSlow + slowEma;
       macdLine.push(fastEmas[i] - slowEma);
    }

    if (macdLine.length < signalPeriod) return null;

    // Signal Line (EMA of MACD Line)
    const kSignal = 2 / (signalPeriod + 1);
    let signalEma = macdLine.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;
    
    for(let i = signalPeriod; i < macdLine.length; i++) {
        signalEma = (macdLine[i] - signalEma) * kSignal + signalEma;
    }
    
    const currentMacd = macdLine[macdLine.length - 1];
    return {
      macd: currentMacd,
      signal: signalEma,
      histogram: currentMacd - signalEma
    };
  },

  /**
   * Calculates Bollinger Bands.
   */
  BollingerBands(data, period = 20, multiplier = 2) {
    if (!data || data.length < period) return null;

    const slice = data.slice(-period);
    const sma = slice.reduce((acc, val) => acc + val.close, 0) / period;
    
    const variance = slice.reduce((acc, val) => {
      const diff = val.close - sma;
      return acc + (diff * diff);
    }, 0) / period;
    
    const stdDev = Math.sqrt(variance);

    return {
      upper: sma + (multiplier * stdDev),
      middle: sma,
      lower: sma - (multiplier * stdDev)
    };
  },

  /**
   * Calculates Intraday VWAP for the current day.
   */
  VWAP(data) {
    if (!data || data.length === 0) return null;
    
    let cumTypicalVolume = 0;
    let cumVolume = 0;
    
    // We only want VWAP for the *current* day in the dataset
    const lastCandleTs = typeof data[data.length - 1].time === 'number' 
      ? data[data.length - 1].time * 1000 
      : new Date(data[data.length - 1].time).getTime();
    if (!Number.isFinite(lastCandleTs)) return null;
    const currentDay = new Date(lastCandleTs).toISOString().slice(0, 10);

    for (let i = 0; i < data.length; i++) {
      const candle = data[i];
      const ts = typeof candle.time === 'number' ? candle.time * 1000 : new Date(candle.time).getTime();
      
      if (Number.isFinite(ts) && new Date(ts).toISOString().slice(0, 10) === currentDay) {
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
      }
    }

    if (cumVolume === 0) {
      const lastClose = Number(data[data.length - 1].close);
      return Number.isFinite(lastClose) ? lastClose : null;
    }
    return cumTypicalVolume / cumVolume;
  },

  /**
   * Calculates Average Volume.
   */
  VolumeAverage(data, period = 20) {
    if (!data || data.length < period) return null;
    const slice = data.slice(-period);
    const sum = slice.reduce((acc, val) => acc + (val.volume || 0), 0);
    return sum / period;
  },

  /**
   * Calculates Relative Volume (RVOL).
   */
  RelativeVolume(data, period = 20) {
    if (!data || data.length <= period) return null;
    const currentVol = Number(data[data.length - 1].volume);
    if (!Number.isFinite(currentVol) || currentVol < 0) return null;
    const previousCandles = data.slice(-(period + 1), -1);
    const avgVol = this.VolumeAverage(previousCandles, period);
    if (!Number.isFinite(avgVol) || avgVol <= 0) return null;
    return currentVol / avgVol;
  }
};
