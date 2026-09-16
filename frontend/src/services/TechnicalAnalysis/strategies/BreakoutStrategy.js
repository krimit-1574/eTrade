/**
 * BreakoutStrategy.js
 * Evaluates 'potential_long_breakout' and 'potential_short_breakdown' setups.
 */

import { StrategyConfig } from '../StrategyConfig';
import { RiskManager } from '../RiskManager';

export const BreakoutStrategy = {
  evaluate(analysis, currentPrice) {
    let decision = "WAIT";
    let invalidation = "Conditions not met";
    let signals = [];

    // LONG BREAKOUT LOGIC
    if (analysis.setup === "potential_long_breakout") {
      if (analysis.relativeVolume >= StrategyConfig.MIN_RVOL_FOR_BREAKOUT) {
        signals.push(`Strong Relative Volume (${analysis.relativeVolume}x)`);
        
        if (analysis.priceVsVWAP === "above") {
          signals.push("Price above VWAP");
          
          if (analysis.trend === "bullish") {
            signals.push("Aligned with bullish trend");
            if (analysis.marketContext) {
              signals.push(`Market Context: ${analysis.marketContext.regime}`);
            }
            
            // Validation complete
            decision = "BUY";
            invalidation = `1m candle closes below VWAP and support at ₹${analysis.support || 'entry'}`;
            
            const riskParams = RiskManager.calculateLongRisk(currentPrice, analysis.atr, analysis.support);
            
            return {
              decision,
              direction: "LONG",
              confidence: analysis.setupStrength,
              setup: "opening_range_breakout",
              signals,
              invalidation,
              ...riskParams
            };
          } else {
            invalidation = "Counter-trend breakout attempt; waiting for trend alignment.";
          }
        } else {
          invalidation = "Price is below VWAP; breakout lacks institutional support.";
        }
      } else {
        invalidation = "Insufficient volume for a breakout. Waiting for volume spike.";
      }
    }
    
    // SHORT BREAKDOWN LOGIC
    else if (analysis.setup === "potential_short_breakdown") {
      if (analysis.relativeVolume >= StrategyConfig.MIN_RVOL_FOR_BREAKOUT) {
        signals.push(`Strong Relative Volume (${analysis.relativeVolume}x)`);
        
        if (analysis.priceVsVWAP === "below") {
          signals.push("Price below VWAP");
          
          if (analysis.trend === "bearish") {
            signals.push("Aligned with bearish trend");
            if (analysis.marketContext) {
              signals.push(`Market Context: ${analysis.marketContext.regime}`);
            }
            
            decision = "SHORT";
            invalidation = `1m candle closes above VWAP and resistance at ₹${analysis.resistance || 'entry'}`;
            
            const riskParams = RiskManager.calculateShortRisk(currentPrice, analysis.atr, analysis.resistance);
            
            return {
              decision,
              direction: "SHORT",
              confidence: 100 - analysis.setupStrength, // Invert strength for shorts
              setup: "support_breakdown",
              signals,
              invalidation,
              ...riskParams
            };
          } else {
            invalidation = "Counter-trend breakdown attempt; waiting for trend alignment.";
          }
        } else {
          invalidation = "Price is above VWAP; breakdown lacks institutional support.";
        }
      } else {
        invalidation = "Insufficient volume for a breakdown. Waiting for volume spike.";
      }
    }

    // Default WAIT response
    return {
      decision: "WAIT",
      direction: "NONE",
      confidence: analysis.setupStrength,
      setup: analysis.setup,
      signals,
      invalidation,
      entry: null,
      stopLoss: null,
      target1: null,
      target2: null,
      riskReward: null
    };
  }
};
