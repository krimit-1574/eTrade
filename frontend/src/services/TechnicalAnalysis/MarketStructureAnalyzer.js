/**
 * MarketStructureAnalyzer.js
 * Analyzes OHLCV data to determine trends, support/resistance, and structure.
 */

export const MarketStructureAnalyzer = {
  /**
   * Identifies Swing Highs and Swing Lows
   * @param {Array} data - Array of OHLCV candles
   * @param {number} lookback - Number of candles to check on left/right
   * @returns {Object} { swingHighs, swingLows }
   */
  findSwings(data, lookback = 3) {
    const swingHighs = [];
    const swingLows = [];

    if (!data || data.length < lookback * 2 + 1) {
      return { swingHighs, swingLows };
    }

    for (let i = lookback; i < data.length - lookback; i++) {
      const currentHigh = data[i].high;
      const currentLow = data[i].low;
      let isHigh = true;
      let isLow = true;

      for (let j = 1; j <= lookback; j++) {
        if (data[i - j].high >= currentHigh || data[i + j].high >= currentHigh) isHigh = false;
        if (data[i - j].low <= currentLow || data[i + j].low <= currentLow) isLow = false;
      }

      if (isHigh) swingHighs.push({ index: i, price: currentHigh, time: data[i].time });
      if (isLow) swingLows.push({ index: i, price: currentLow, time: data[i].time });
    }

    return { swingHighs, swingLows };
  },

  /**
   * Determines current market structure based on recent swings (e.g., HH, HL, LH, LL).
   */
  analyzeStructure(data) {
    const { swingHighs, swingLows } = this.findSwings(data, 2);
    
    if (swingHighs.length < 2 || swingLows.length < 2) {
      return "consolidating";
    }

    const lastHigh = swingHighs[swingHighs.length - 1].price;
    const prevHigh = swingHighs[swingHighs.length - 2].price;
    const lastLow = swingLows[swingLows.length - 1].price;
    const prevLow = swingLows[swingLows.length - 2].price;

    const isHigherHigh = lastHigh > prevHigh;
    const isLowerHigh = lastHigh < prevHigh;
    const isHigherLow = lastLow > prevLow;
    const isLowerLow = lastLow < prevLow;

    if (isHigherHigh && isHigherLow) return "higher_highs_higher_lows"; // Uptrend
    if (isLowerHigh && isLowerLow) return "lower_highs_lower_lows";   // Downtrend
    if (isLowerHigh && isHigherLow) return "contracting_triangle";
    if (isHigherHigh && isLowerLow) return "expanding_volatility";
    
    return "ranging";
  },

  /**
   * Calculates overall trend based on EMAs and structure.
   */
  detectTrend(price, ema9, ema20, ema50, structure) {
    let score = 0;
    
    if (ema9 && ema20 && ema9 > ema20) score += 1;
    if (ema9 && ema20 && ema9 < ema20) score -= 1;
    
    if (price && ema50 && price > ema50) score += 1;
    if (price && ema50 && price < ema50) score -= 1;

    if (structure === "higher_highs_higher_lows") score += 2;
    if (structure === "lower_highs_lower_lows") score -= 2;

    if (score >= 2) return "bullish";
    if (score <= -2) return "bearish";
    return "sideways";
  },

  /**
   * Estimates Support and Resistance levels based on recent price action and swings.
   */
  getSupportResistance(data) {
    if (!data || data.length === 0) return { support: null, resistance: null };
    
    // Look at last 50 candles for local S/R
    const recentData = data.slice(-50);
    const { swingHighs, swingLows } = this.findSwings(recentData, 3);
    
    const currentPrice = data[data.length - 1].close;

    // Find closest swing high above current price
    const resistanceLevels = swingHighs
      .filter(s => s.price > currentPrice)
      .sort((a, b) => a.price - b.price);
      
    // Find closest swing low below current price
    const supportLevels = swingLows
      .filter(s => s.price < currentPrice)
      .sort((a, b) => b.price - a.price); // Descending, so [0] is closest below

    let resistance = resistanceLevels.length > 0 ? resistanceLevels[0].price : null;
    let support = supportLevels.length > 0 ? supportLevels[0].price : null;

    // Fallbacks if no swings found in recent window
    if (!resistance) {
      resistance = Math.max(...recentData.map(c => c.high));
    }
    if (!support) {
      support = Math.min(...recentData.map(c => c.low));
    }

    return { 
      support: parseFloat(support.toFixed(2)), 
      resistance: parseFloat(resistance.toFixed(2)) 
    };
  }
};
