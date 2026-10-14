/**
 * CandlestickPatternDetector.js
 * Detects common 1-3 candle patterns at the end of an OHLCV array.
 * IMPORTANT: Patterns are only technical signals, NOT trade triggers.
 */

export const CandlestickPatternDetector = {
  
  detectAll(data) {
    if (!Array.isArray(data) || data.length === 0) return [];
    
    const patterns = [];
    
    if (this.isHammer(data)) patterns.push("hammer");
    if (this.isInvertedHammer(data)) {
      const priorCloses = data.slice(0, -1).slice(-3).map((candle) => Number(candle.close));
      const wasRising = priorCloses.length >= 2 && priorCloses.at(-1) > priorCloses[0];
      patterns.push(wasRising ? "shooting_star" : "inverted_hammer");
    }
    if (this.isDoji(data)) patterns.push("doji");
    if (this.isPinBar(data)) patterns.push("pin_bar");
    if (this.isMarubozu(data)) patterns.push("marubozu");

    if (data.length >= 2) {
      if (this.isBullishEngulfing(data)) patterns.push("bullish_engulfing");
      if (this.isBearishEngulfing(data)) patterns.push("bearish_engulfing");
      if (this.isInsideBar(data)) patterns.push("inside_bar");
      if (this.isOutsideBar(data)) patterns.push("outside_bar");
      if (this.isTweezerTop(data)) patterns.push("tweezer_top");
      if (this.isTweezerBottom(data)) patterns.push("tweezer_bottom");
    }

    if (data.length >= 3) {
      if (this.isMorningStar(data)) patterns.push("morning_star");
      if (this.isEveningStar(data)) patterns.push("evening_star");
    }

    return patterns;
  },

  // --- Helper Methods for Candle Math ---
  getBody(candle) {
    return Math.abs(candle.open - candle.close);
  },
  getRange(candle) {
    return candle.high - candle.low;
  },
  getUpperWick(candle) {
    return candle.high - Math.max(candle.open, candle.close);
  },
  getLowerWick(candle) {
    return Math.min(candle.open, candle.close) - candle.low;
  },
  isBullish(candle) {
    return candle.close > candle.open;
  },
  isBearish(candle) {
    return candle.close < candle.open;
  },

  // --- Pattern Detectors (Looking at the most recent candles) ---

  isDoji(data) {
    if (!Array.isArray(data) || data.length < 1) return false;
    const c = data[data.length - 1];
    const body = this.getBody(c);
    const range = this.getRange(c);
    return range > 0 && (body / range) <= 0.1; // Body is less than 10% of total range
  },

  isHammer(data) {
    if (!Array.isArray(data) || data.length < 1) return false;
    const c = data[data.length - 1];
    const body = this.getBody(c);
    const range = this.getRange(c);
    const lowerWick = this.getLowerWick(c);
    const upperWick = this.getUpperWick(c);
    
    return range > 0 && 
           lowerWick >= (body * 2) && 
           upperWick <= (range * 0.1) && 
           !this.isDoji(data);
  },

  isInvertedHammer(data) {
    if (!Array.isArray(data) || data.length < 1) return false;
    // Looks like a shooting star but appears after a downtrend (we just check shape here)
    const c = data[data.length - 1];
    const body = this.getBody(c);
    const range = this.getRange(c);
    const lowerWick = this.getLowerWick(c);
    const upperWick = this.getUpperWick(c);
    
    return range > 0 && 
           upperWick >= (body * 2) && 
           lowerWick <= (range * 0.1) && 
           !this.isDoji(data);
  },

  isShootingStar(data) {
    // Same shape as inverted hammer
    return this.isInvertedHammer(data); 
  },

  isBullishEngulfing(data) {
    if (!Array.isArray(data) || data.length < 2) return false;
    const curr = data[data.length - 1];
    const prev = data[data.length - 2];
    
    return this.isBearish(prev) && 
           this.isBullish(curr) && 
           curr.open <= prev.close && 
           curr.close > prev.open;
  },

  isBearishEngulfing(data) {
    if (!Array.isArray(data) || data.length < 2) return false;
    const curr = data[data.length - 1];
    const prev = data[data.length - 2];
    
    return this.isBullish(prev) && 
           this.isBearish(curr) && 
           curr.open >= prev.close && 
           curr.close < prev.open;
  },

  isInsideBar(data) {
    if (!Array.isArray(data) || data.length < 2) return false;
    const curr = data[data.length - 1];
    const prev = data[data.length - 2];
    
    return curr.high <= prev.high && curr.low >= prev.low;
  },

  isOutsideBar(data) {
    if (!Array.isArray(data) || data.length < 2) return false;
    const curr = data[data.length - 1];
    const prev = data[data.length - 2];
    
    return curr.high > prev.high && curr.low < prev.low;
  },

  isMorningStar(data) {
    if (!Array.isArray(data) || data.length < 3) return false;
    const c3 = data[data.length - 1]; // Current
    const c2 = data[data.length - 2]; // Middle
    const c1 = data[data.length - 3]; // First
    
    const isC1Bearish = this.isBearish(c1) && this.getBody(c1) > (this.getRange(c1) * 0.5);
    const isC2Small = this.getBody(c2) <= (this.getRange(c2) * 0.3); // Star/Doji
    const isC3Bullish = this.isBullish(c3) && c3.close > (c1.open + c1.close) / 2;
    
    return isC1Bearish && isC2Small && isC3Bullish && c2.close < c1.close;
  },

  isEveningStar(data) {
    if (!Array.isArray(data) || data.length < 3) return false;
    const c3 = data[data.length - 1]; 
    const c2 = data[data.length - 2]; 
    const c1 = data[data.length - 3]; 
    
    const isC1Bullish = this.isBullish(c1) && this.getBody(c1) > (this.getRange(c1) * 0.5);
    const isC2Small = this.getBody(c2) <= (this.getRange(c2) * 0.3);
    const isC3Bearish = this.isBearish(c3) && c3.close < (c1.open + c1.close) / 2;
    
    return isC1Bullish && isC2Small && isC3Bearish && c2.close > c1.close;
  },

  isPinBar(data) {
    if (!Array.isArray(data) || data.length < 1) return false;
    const c = data[data.length - 1];
    const range = this.getRange(c);
    const body = this.getBody(c);
    const upperWick = this.getUpperWick(c);
    const lowerWick = this.getLowerWick(c);
    
    if (range === 0) return false;
    
    const isBullishPin = lowerWick / range >= 0.6 && upperWick / range <= 0.15 && body / range <= 0.25;
    const isBearishPin = upperWick / range >= 0.6 && lowerWick / range <= 0.15 && body / range <= 0.25;
    
    return isBullishPin || isBearishPin;
  },

  isMarubozu(data) {
    if (!Array.isArray(data) || data.length < 1) return false;
    const c = data[data.length - 1];
    const range = this.getRange(c);
    if (range === 0) return false;
    
    const body = this.getBody(c);
    return body / range >= 0.95; // Almost no wicks
  },

  isTweezerTop(data) {
    if (!Array.isArray(data) || data.length < 2) return false;
    const curr = data[data.length - 1];
    const prev = data[data.length - 2];
    
    // Highs match within 0.1%
    const threshold = prev.high * 0.001; 
    return this.isBullish(prev) && this.isBearish(curr) && Math.abs(curr.high - prev.high) <= threshold;
  },

  isTweezerBottom(data) {
    if (!Array.isArray(data) || data.length < 2) return false;
    const curr = data[data.length - 1];
    const prev = data[data.length - 2];
    
    // Lows match within 0.1%
    const threshold = prev.low * 0.001; 
    return this.isBearish(prev) && this.isBullish(curr) && Math.abs(curr.low - prev.low) <= threshold;
  }
};
