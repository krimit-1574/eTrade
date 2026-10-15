/**
 * RiskManager.js
 * Calculates Stop Loss, Targets, and Risk/Reward for a given setup.
 */

import { StrategyConfig } from './StrategyConfig';

function positiveNumber(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const RiskManager = {
  
  /**
   * Calculates long trade risk parameters.
   */
  calculateLongRisk(entry, atr, support) {
    const safeEntry = positiveNumber(entry);
    if (safeEntry === null) return null;
    const safeAtr = positiveNumber(atr) ?? (safeEntry * 0.008);
    const safeSupport = positiveNumber(support);
    
    // Default SL based on ATR
    let stopLoss = safeEntry - (safeAtr * StrategyConfig.ATR_STOP_MULTIPLIER);
    
    // If a recent support level exists and is close enough, use it instead (slightly below it)
    if (safeSupport !== null && safeSupport < safeEntry && safeEntry - safeSupport < (safeEntry * StrategyConfig.MAX_STOP_PCT)) {
      // Use whichever is wider (safer) to avoid being stopped out by noise, 
      // but cap it at the max allowed stop distance.
      const supportSL = safeSupport * 0.998; // 0.2% below support
      stopLoss = Math.min(stopLoss, supportSL);
    }
    
    // Check max stop limit
    if ((safeEntry - stopLoss) / safeEntry > StrategyConfig.MAX_STOP_PCT) {
      stopLoss = safeEntry * (1 - StrategyConfig.MAX_STOP_PCT);
    }
    
    const risk = safeEntry - stopLoss;
    const target1 = safeEntry + (risk * StrategyConfig.TARGET_1_MULTIPLIER);
    const target2 = safeEntry + (risk * StrategyConfig.TARGET_2_MULTIPLIER);
    
    return {
      entry: parseFloat(safeEntry.toFixed(2)),
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
    const safeEntry = positiveNumber(entry);
    if (safeEntry === null) return null;
    const safeAtr = positiveNumber(atr) ?? (safeEntry * 0.008);
    const safeResistance = positiveNumber(resistance);
    
    let stopLoss = safeEntry + (safeAtr * StrategyConfig.ATR_STOP_MULTIPLIER);
    
    if (safeResistance !== null && safeResistance > safeEntry && safeResistance - safeEntry < (safeEntry * StrategyConfig.MAX_STOP_PCT)) {
      const resistanceSL = safeResistance * 1.002; // 0.2% above resistance
      stopLoss = Math.max(stopLoss, resistanceSL);
    }
    
    if ((stopLoss - safeEntry) / safeEntry > StrategyConfig.MAX_STOP_PCT) {
      stopLoss = safeEntry * (1 + StrategyConfig.MAX_STOP_PCT);
    }
    
    const risk = stopLoss - safeEntry;
    const target1 = safeEntry - (risk * StrategyConfig.TARGET_1_MULTIPLIER);
    const target2 = safeEntry - (risk * StrategyConfig.TARGET_2_MULTIPLIER);
    if (target2 <= 0) return null;
    
    return {
      entry: parseFloat(safeEntry.toFixed(2)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      target1: parseFloat(target1.toFixed(2)),
      target2: parseFloat(target2.toFixed(2)),
      riskReward: StrategyConfig.TARGET_1_MULTIPLIER
    };
  }
};
