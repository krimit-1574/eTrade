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
   * @param {Object} [marketContext] - Optional market context from MarketContextService
   * @returns {Object} - Trade Decision Object
   */
  evaluate(analysis, currentPrice, marketContext = null) {
    if (!analysis || !currentPrice) return this._createWaitDecision("Insufficient data for analysis.");

    // Market Context Invalidation Check (Part 10)
    // If the broad market is in severe breakdown and we're looking at a long setup, warn
    if (marketContext?.regime) {
      const regime = marketContext.regime;
      if (regime.bias === 'WAIT' && regime.regime === 'HIGH_VOLATILITY') {
        // Don't outright block, but add invalidation note for high-volatility divergence
        if (analysis.setup === 'potential_long_breakout' || analysis.setup === 'potential_short_breakdown') {
          const decision = this._evaluateStrategy(analysis, currentPrice);
          if (decision.decision !== 'WAIT') {
            decision.invalidation = (decision.invalidation || '') +
              ` ⚠ Market Context: ${regime.label} — elevated sectoral divergence detected. Proceed with caution.`;
          }
          return decision;
        }
      }
    }

    return this._evaluateStrategy(analysis, currentPrice);
  },

  /**
   * Internal strategy dispatch based on detected setup type.
   */
  _evaluateStrategy(analysis, currentPrice) {
    switch (analysis.setup) {
      case "potential_long_breakout":
      case "potential_short_breakdown":
        return BreakoutStrategy.evaluate(analysis, currentPrice);
      
      case "long_pullback_setup":
      case "short_pullback_setup":
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

