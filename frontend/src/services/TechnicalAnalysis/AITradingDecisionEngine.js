/**
 * AITradingDecisionEngine.js
 * The core decision engine that evaluates structured analysis against trading strategies.
 */

import { BreakoutStrategy } from './strategies/BreakoutStrategy';

export const AITradingDecisionEngine = {
  
  /**
   * Evaluates the technical analysis and returns a structured trade decision.
   * @param {Object} analysis - The output from SetupAnalyzer
   * @param {number} currentPrice - The latest tick/candle close price
   * @returns {Object} - Trade Decision Object
   */
  evaluate(analysis, currentPrice) {
    if (!analysis || !currentPrice) return this._createWaitDecision("Insufficient data for analysis.");

    // Select strategy based on the setup detected by the Technical Engine
    switch (analysis.setup) {
      case "potential_long_breakout":
      case "potential_short_breakdown":
        return BreakoutStrategy.evaluate(analysis, currentPrice);
      
      case "long_pullback_setup":
      case "short_pullback_setup":
        // For now, return WAIT until PullbackStrategy is fully implemented
        return this._createWaitDecision(
          "Pullback detected, but waiting for stronger confirmation.", 
          analysis.setup, 
          analysis.setupStrength
        );

      case "neutral_monitoring":
      default:
        return this._createWaitDecision(
          "Market structure is neutral or choppy. Waiting for a clear setup.",
          analysis.setup,
          analysis.setupStrength
        );
    }
  },

  _createWaitDecision(reason, setup = "monitoring", confidence = 50) {
    return {
      decision: "WAIT",
      direction: "NONE",
      confidence: confidence,
      setup: setup,
      signals: [],
      invalidation: reason,
      entry: null,
      stopLoss: null,
      target1: null,
      target2: null,
      riskReward: null
    };
  }
};
