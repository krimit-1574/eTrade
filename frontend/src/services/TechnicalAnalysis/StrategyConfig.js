/**
 * StrategyConfig.js
 * Central configuration for AI Trading Decision Engine rules.
 */

export const StrategyConfig = {
  // Risk & Reward Constants
  MIN_RISK_REWARD: 1.5,       // Target 1 must be at least 1.5x Risk
  TARGET_1_MULTIPLIER: 1.5,   // Entry + (Risk * 1.5)
  TARGET_2_MULTIPLIER: 2.5,   // Entry + (Risk * 2.5)
  
  // Stop Loss Calculation Constants
  ATR_STOP_MULTIPLIER: 1.5,   // SL is placed 1.5x ATR away from entry by default
  MAX_STOP_PCT: 0.02,         // Max 2% stop loss allowed (hard invalidate if wider)

  // Confidence & Validation Constants
  MIN_CONFIDENCE_TO_TRADE: 65,
  MIN_RVOL_FOR_BREAKOUT: 1.2, // Need at least 20% higher than average volume for breakouts

  // Status Strings
  STATUS_WAITING: "WAITING FOR SETUP",
  STATUS_CONFIRMING: "WAITING FOR CONFIRMATION",
  STATUS_LONG_DETECTED: "LONG SETUP DETECTED",
  STATUS_SHORT_DETECTED: "SHORT SETUP DETECTED"
};
