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
    const price = Number(currentPrice);
    if (!analysis || typeof analysis !== 'object' || !Number.isFinite(price) || price <= 0) {
      return this._createWaitDecision('Insufficient or invalid data for analysis.');
    }

    if (
      (analysis.setup === 'potential_long_breakout' || analysis.setup === 'potential_short_breakdown') &&
      (!Number.isFinite(Number(analysis.atr)) || Number(analysis.atr) <= 0 ||
        !Number.isFinite(Number(analysis.relativeVolume)) || Number(analysis.relativeVolume) < 0 ||
        !Number.isFinite(Number(analysis.setupStrength)))
    ) {
      return this._createWaitDecision(
        'Required ATR, volume, or setup-strength data is unavailable.',
        analysis.setup,
        Number.isFinite(Number(analysis.setupStrength)) ? Number(analysis.setupStrength) : 0
      );
    }

    // Market Context Invalidation Check (Part 10)
    // If the broad market is in severe breakdown and we're looking at a long setup, warn
    if (marketContext?.regime) {
      const regime = marketContext.regime;
      if (regime.bias === 'WAIT' && regime.regime === 'HIGH_VOLATILITY') {
        // Don't outright block, but add invalidation note for high-volatility divergence
        if (analysis.setup === 'potential_long_breakout' || analysis.setup === 'potential_short_breakdown') {
          const decision = this._validateDecision(this._evaluateStrategy(analysis, price), price);
          if (decision.decision !== 'WAIT') {
            decision.invalidation = (decision.invalidation || '') +
              ` ⚠ Market Context: ${regime.label} — elevated sectoral divergence detected. Proceed with caution.`;
          }
          return decision;
        }
      }
    }

    return this._validateDecision(this._evaluateStrategy(analysis, price), price);
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
  },

  _validateDecision(decision, currentPrice) {
    if (!decision || (decision.decision !== 'BUY' && decision.decision !== 'SHORT')) {
      return decision || this._createWaitDecision('Strategy did not return a valid decision.');
    }

    const entry = Number(decision.entry);
    const stopLoss = Number(decision.stopLoss);
    const target1 = Number(decision.target1);
    const target2 = Number(decision.target2);
    const isFinitePlan = [entry, stopLoss, target1, target2].every(
      value => Number.isFinite(value) && value > 0
    );
    const isDirectionallyValid = decision.decision === 'BUY'
      ? stopLoss < entry && target1 > entry && target2 >= target1
      : stopLoss > entry && target1 < entry && target2 <= target1;

    if (!isFinitePlan || !isDirectionallyValid || Math.abs(entry - currentPrice) / currentPrice > 0.1) {
      return this._createWaitDecision(
        'Strategy produced invalid or stale entry, stop, or target levels.',
        decision.setup,
        decision.confidence
      );
    }

    return decision;
  }
};
