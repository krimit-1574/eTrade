/**
 * RiskManager.js
 * Calculates Stop Loss, Targets, and Risk/Reward for a given setup.
 */

import { StrategyConfig } from './StrategyConfig';

export const RiskManager = {
  
  /**
   * Calculates long trade risk parameters.
   */
  calculateLongRisk(entry, atr, support) {
    if (!entry) return null;
    
    // Default SL based on ATR
    let stopLoss = entry - (atr * StrategyConfig.ATR_STOP_MULTIPLIER);
    
    // If a recent support level exists and is close enough, use it instead (slightly below it)
    if (support && support < entry && entry - support < (entry * StrategyConfig.MAX_STOP_PCT)) {
      // Use whichever is wider (safer) to avoid being stopped out by noise, 
      // but cap it at the max allowed stop distance.
      const supportSL = support * 0.998; // 0.2% below support
      stopLoss = Math.min(stopLoss, supportSL);
    }
    
    // Check max stop limit
    if ((entry - stopLoss) / entry > StrategyConfig.MAX_STOP_PCT) {
      stopLoss = entry * (1 - StrategyConfig.MAX_STOP_PCT);
    }
    
    const risk = entry - stopLoss;
    const target1 = entry + (risk * StrategyConfig.TARGET_1_MULTIPLIER);
    const target2 = entry + (risk * StrategyConfig.TARGET_2_MULTIPLIER);
    
    return {
      entry: parseFloat(entry.toFixed(2)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      target1: parseFloat(target1.toFixed(2)),
      target2: parseFloat(target2.toFixed(2)),
      riskReward: StrategyConfig.TARGET_1_MULTIPLIER
    };
  },

  /**
   * Calculates short trade risk parameters.
   */
  calculateShortRisk(entry, atr, resistance) {
    if (!entry) return null;
    
    let stopLoss = entry + (atr * StrategyConfig.ATR_STOP_MULTIPLIER);
    
    if (resistance && resistance > entry && resistance - entry < (entry * StrategyConfig.MAX_STOP_PCT)) {
      const resistanceSL = resistance * 1.002; // 0.2% above resistance
      stopLoss = Math.max(stopLoss, resistanceSL);
    }
    
    if ((stopLoss - entry) / entry > StrategyConfig.MAX_STOP_PCT) {
      stopLoss = entry * (1 + StrategyConfig.MAX_STOP_PCT);
    }
    
    const risk = stopLoss - entry;
    const target1 = entry - (risk * StrategyConfig.TARGET_1_MULTIPLIER);
    const target2 = entry - (risk * StrategyConfig.TARGET_2_MULTIPLIER);
    
    return {
      entry: parseFloat(entry.toFixed(2)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      target1: parseFloat(target1.toFixed(2)),
      target2: parseFloat(target2.toFixed(2)),
      riskReward: StrategyConfig.TARGET_1_MULTIPLIER
    };
  }
};
