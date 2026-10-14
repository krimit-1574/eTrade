/**
 * SetupAnalyzer.js
 * Combines technical factors from IndicatorEngine, MarketStructureAnalyzer, 
 * and CandlestickPatternDetector to generate a structured analysis object.
 */

import { IndicatorEngine } from './IndicatorEngine';
import { MarketStructureAnalyzer } from './MarketStructureAnalyzer';
import { CandlestickPatternDetector } from './CandlestickPatternDetector';

const MIN_ANALYSIS_CANDLES = 50;

function normalizeCandles(data) {
  if (!Array.isArray(data) || data.length < MIN_ANALYSIS_CANDLES) return null;

  const normalized = data.map((candle) => {
    const open = Number(candle?.open);
    const high = Number(candle?.high);
    const low = Number(candle?.low);
    const close = Number(candle?.close);
    const volume = candle?.volume == null ? 0 : Number(candle.volume);
    const timestamp = typeof candle?.time === 'number'
      ? candle.time * 1000
      : new Date(candle?.time).getTime();

    if (
      ![open, high, low, close, volume, timestamp].every(Number.isFinite)
      || open <= 0
      || high <= 0
      || low <= 0
      || close <= 0
      || volume < 0
      || high < Math.max(open, close)
      || low > Math.min(open, close)
      || high < low
    ) {
      return null;
    }

    return { ...candle, open, high, low, close, volume, _timestamp: timestamp };
  });

  if (normalized.some((candle) => candle === null)) return null;
  return normalized
    .sort((a, b) => a._timestamp - b._timestamp)
    .map((item) => {
      const candle = { ...item };
      delete candle._timestamp;
      return candle;
    });
}

export const SetupAnalyzer = {
  
  analyze(symbol, data, marketContext = null) {
    const candles = normalizeCandles(data);
    if (!candles) return null;

    const currentPrice = candles[candles.length - 1].close;
    
    // 1. Calculate Indicators
    const ema9 = IndicatorEngine.EMA(candles, 9);
    const ema20 = IndicatorEngine.EMA(candles, 20);
    const ema50 = IndicatorEngine.EMA(candles, 50);
    const rsi = IndicatorEngine.RSI(candles, 14);
    const atr = IndicatorEngine.ATR(candles, 14);
    const vwap = IndicatorEngine.VWAP(candles);
    const rvol = IndicatorEngine.RelativeVolume(candles, 20);
    const macdData = IndicatorEngine.MACD(candles);

    // 2. Analyze Structure & S/R
    const structure = MarketStructureAnalyzer.analyzeStructure(candles);
    const trend = MarketStructureAnalyzer.detectTrend(currentPrice, ema9, ema20, ema50, structure);
    const { support, resistance } = MarketStructureAnalyzer.getSupportResistance(candles);

    // 3. Detect Candlestick Patterns
    const detectedPatterns = CandlestickPatternDetector.detectAll(candles);

    // 4. Evaluate Setup & Strength
    let setupStrength = 50; // Base neutral
    let setup = "neutral_monitoring";
    let explanationParts = [];

    const priceVsVWAP = currentPrice > vwap ? "above" : "below";
    const emaAlignment = (ema9 && ema20 && ema9 > ema20) ? "bullish" : ((ema9 && ema20 && ema9 < ema20) ? "bearish" : "mixed");
    const volumeCondition = rvol > 1.5 ? "strong" : (rvol < 0.8 ? "weak" : "average");

    // --- Build Explanation & Adjust Strength ---

    // Trend & Structure
    if (trend === "bullish") {
      explanationParts.push(`Bullish trend detected with ${structure.replace(/_/g, ' ')}.`);
      setupStrength += 10;
    } else if (trend === "bearish") {
      explanationParts.push(`Bearish trend detected with ${structure.replace(/_/g, ' ')}.`);
      setupStrength -= 10;
    } else {
      explanationParts.push(`Market is currently ranging (${structure.replace(/_/g, ' ')}).`);
    }

    // VWAP & EMAs
    if (priceVsVWAP === "above") {
      explanationParts.push("Price is trading above VWAP.");
      setupStrength += 5;
    } else {
      explanationParts.push("Price is trading below VWAP.");
      setupStrength -= 5;
    }

    if (emaAlignment === "bullish") {
      explanationParts.push("Short-term momentum is positive (EMA 9 > EMA 20).");
      setupStrength += 5;
    } else if (emaAlignment === "bearish") {
      explanationParts.push("Short-term momentum is negative (EMA 9 < EMA 20).");
      setupStrength -= 5;
    }

    // RSI
    if (rsi > 60) {
      explanationParts.push("RSI indicates bullish momentum.");
      setupStrength += 5;
    } else if (rsi < 40) {
      explanationParts.push("RSI indicates bearish momentum.");
      setupStrength -= 5;
    }

    // Volume
    if (volumeCondition === "strong") {
      explanationParts.push(`Relative volume is elevated (${rvol.toFixed(1)}x).`);
      // Volume amplifies current strength deviation from 50
      if (setupStrength > 50) setupStrength += 10;
      if (setupStrength < 50) setupStrength -= 10;
    }

    // Patterns
    if (detectedPatterns.length > 0) {
      const formattedPatterns = detectedPatterns.map(p => p.replace(/_/g, ' ')).join(', ');
      explanationParts.push(`Recent candle formation shows: ${formattedPatterns}.`);
      
      const bullishPatterns = ['hammer', 'bullish_engulfing', 'morning_star', 'inside_bar', 'tweezer_bottom'];
      const bearishPatterns = ['shooting_star', 'bearish_engulfing', 'evening_star', 'tweezer_top'];
      
      const hasBull = detectedPatterns.some(p => bullishPatterns.includes(p));
      const hasBear = detectedPatterns.some(p => bearishPatterns.includes(p));
      
      if (hasBull) setupStrength += 10;
      if (hasBear) setupStrength -= 10;
    }

    // S/R Context
    if (resistance && currentPrice >= resistance * 0.995 && currentPrice <= resistance) {
      explanationParts.push(`Price is approaching resistance at ₹${resistance}.`);
    } else if (support && currentPrice <= support * 1.005 && currentPrice >= support) {
      explanationParts.push(`Price is testing support at ₹${support}.`);
    } else if (resistance && currentPrice > resistance) {
      explanationParts.push(`Price broke above recent resistance at ₹${resistance}.`);
      setupStrength += 10;
    } else if (support && currentPrice < support) {
      explanationParts.push(`Price broke below recent support at ₹${support}.`);
      setupStrength -= 10;
    }

    // Market & Sector Context Confluence (Part 10)
    let marketAlignment = 'NEUTRAL';
    if (marketContext && marketContext.regime) {
      const regime = marketContext.regime;
      if (regime.bias === 'LONG') {
        if (setupStrength >= 50) {
          setupStrength += 5;
          explanationParts.push(`General market (${regime.label}) aligns with bullish bias.`);
          marketAlignment = 'ALIGNED_BULLISH';
        } else {
          setupStrength += 2;
          marketAlignment = 'DIVERGENT';
        }
      } else if (regime.bias === 'SHORT') {
        if (setupStrength <= 50) {
          setupStrength -= 5;
          explanationParts.push(`General market (${regime.label}) aligns with bearish bias.`);
          marketAlignment = 'ALIGNED_BEARISH';
        } else {
          setupStrength -= 2;
          marketAlignment = 'DIVERGENT';
        }
      }
    }

    // Determine Final Setup Type
    if (setupStrength >= 75) setup = "potential_long_breakout";
    else if (setupStrength >= 60) setup = "long_pullback_setup";
    else if (setupStrength <= 25) setup = "potential_short_breakdown";
    else if (setupStrength <= 40) setup = "short_pullback_setup";

    // Normalize strength 0-100
    setupStrength = Math.max(0, Math.min(100, setupStrength));

    return {
      symbol: symbol,
      trend: trend,
      marketStructure: structure,
      priceVsVWAP: priceVsVWAP,
      emaAlignment: emaAlignment,
      rsi: Number.isFinite(rsi) ? Math.round(rsi) : null,
      macd: macdData ? {
        histogram: parseFloat(macdData.histogram.toFixed(2)),
        signal: parseFloat(macdData.signal.toFixed(2)),
      } : null,
      atr: Number.isFinite(atr) ? parseFloat(atr.toFixed(2)) : null,
      relativeVolume: Number.isFinite(rvol) ? parseFloat(rvol.toFixed(1)) : null,
      volumeCondition: volumeCondition,
      detectedPatterns: detectedPatterns,
      support: support,
      resistance: resistance,
      setup: setup,
      setupStrength: setupStrength,
      marketContext: marketContext ? {
        regime: marketContext.regime?.label || 'Neutral',
        alignment: marketAlignment,
        sector: marketContext.sector?.name || null,
      } : null,
      explanation: explanationParts.join(' ')
    };
  }
};
