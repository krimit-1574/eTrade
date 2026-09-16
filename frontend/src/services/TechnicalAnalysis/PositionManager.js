/**
 * PositionManager.js
 * Autonomous Intraday Paper Trade Lifecycle Management.
 *
 * Responsibilities:
 * - Real-time position tracking and evaluation
 * - Target 1 partial profit-taking (50% scale-out)
 * - Automatic Break-Even stop moves at +0.7R
 * - Dynamic trailing stop execution (ATR / Swing based)
 * - Early exits on structure breakdown or opposite high-confidence signals
 * - Enforcing stop loss widening prevention (Rule 8)
 * - Intraday cutoff auto-exit at 15:15 IST
 */

export const POSITION_DECISION = {
  HOLD: 'HOLD',
  PARTIAL_EXIT: 'PARTIAL_EXIT',
  MOVE_TO_BREAKEVEN: 'MOVE_TO_BREAKEVEN',
  TRAIL_STOP: 'TRAIL_STOP',
  TAKE_PROFIT: 'TAKE_PROFIT',
  EXIT: 'EXIT',
  MOVE_STOP: 'MOVE_STOP',
};

export const PositionManager = {

  /**
   * Evaluates active position state against current market indicators and rules.
   * @returns {{ action, reason, exitQuantity, newStop, markerType, rMultiple }}
   */
  evaluatePosition({
    position,
    currentPrice,
    candleHigh,
    candleLow,
    technicalAnalysis,
    latestDecision,
    riskSettings,
  }) {
    if (!position || !currentPrice || currentPrice <= 0) {
      return { action: POSITION_DECISION.HOLD, reason: 'No active position or invalid price' };
    }

    const {
      entryPrice,
      stopLoss,
      target1,
      target2,
      direction,
      quantity,
      partialExits = [],
      breakevenMoved = false,
      initialStopLoss = stopLoss,
    } = position;

    const high = candleHigh ?? currentPrice;
    const low = candleLow ?? currentPrice;

    // 1. Calculate R-Multiple: Profit expressed in initial risk units
    const initialRiskDistance = Math.abs(entryPrice - (initialStopLoss || stopLoss));
    const priceDiff = direction === 'LONG' ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
    const rMultiple = initialRiskDistance > 0 ? parseFloat((priceDiff / initialRiskDistance).toFixed(2)) : 0;

    // 2. Intraday Cutoff Time Guard (15:15 IST)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    const [cutoffH, cutoffM] = (riskSettings?.intradayCutoffTime || '15:15').split(':').map(Number);
    const currentNum = ist.getHours() * 100 + ist.getMinutes();
    const cutoffNum = cutoffH * 100 + cutoffM;

    if (currentNum >= cutoffNum) {
      return {
        action: POSITION_DECISION.EXIT,
        reason: `Intraday cutoff reached (${riskSettings?.intradayCutoffTime || '15:15'} IST). Square-off enforced.`,
        markerType: 'FINAL EXIT',
        rMultiple,
      };
    }

    // 3. Stop-Loss Breach Check
    if (direction === 'LONG' && low <= stopLoss) {
      return {
        action: POSITION_DECISION.EXIT,
        reason: 'Stop Loss Hit',
        exitPrice: stopLoss,
        markerType: 'STOP',
        rMultiple,
      };
    }
    if (direction === 'SHORT' && high >= stopLoss) {
      return {
        action: POSITION_DECISION.EXIT,
        reason: 'Stop Loss Hit',
        exitPrice: stopLoss,
        markerType: 'STOP',
        rMultiple,
      };
    }

    // 4. Target 2 Reached: Final Profit Taking
    if (target2) {
      if (direction === 'LONG' && high >= target2) {
        return {
          action: POSITION_DECISION.TAKE_PROFIT,
          reason: `Target 2 Reached @ ₹${target2}. Full profit taken.`,
          exitPrice: target2,
          markerType: 'TARGET',
          rMultiple,
        };
      }
      if (direction === 'SHORT' && low <= target2) {
        return {
          action: POSITION_DECISION.TAKE_PROFIT,
          reason: `Target 2 Reached @ ₹${target2}. Full profit taken.`,
          exitPrice: target2,
          markerType: 'TARGET',
          rMultiple,
        };
      }
    }

    // 5. Target 1 Reached: Partial Exit (50% scale-out)
    const hasTakenPartial = partialExits.length > 0;
    if (target1 && !hasTakenPartial && quantity > 1) {
      if ((direction === 'LONG' && high >= target1) || (direction === 'SHORT' && low <= target1)) {
        const exitQty = Math.ceil(quantity / 2);
        return {
          action: POSITION_DECISION.PARTIAL_EXIT,
          reason: `Target 1 Reached @ ₹${target1}. 50% scale-out.`,
          exitQuantity: exitQty,
          exitPrice: target1,
          markerType: 'PARTIAL EXIT',
          rMultiple,
        };
      }
    }

    // 6. Move to Break-Even Check (+0.7R favorable move or post-Target 1)
    if (!breakevenMoved) {
      const shouldMoveToBE = rMultiple >= 0.7 || hasTakenPartial;
      if (shouldMoveToBE) {
        // Break-even stop is entry price plus small buffer to cover commission
        const beStop = direction === 'LONG' 
          ? parseFloat((entryPrice * 1.0005).toFixed(2)) 
          : parseFloat((entryPrice * 0.9995).toFixed(2));

        const isNarrowing = direction === 'LONG' ? beStop > stopLoss : beStop < stopLoss;
        if (isNarrowing) {
          return {
            action: POSITION_DECISION.MOVE_TO_BREAKEVEN,
            reason: `Trade gained +${rMultiple}R. Stop moved to break-even to eliminate risk.`,
            newStop: beStop,
            rMultiple,
          };
        }
      }
    }

    // 7. Trailing Stop Logic (Active after Break-Even or Partial Exit)
    if (breakevenMoved || hasTakenPartial || rMultiple >= 1.0) {
      const atr = technicalAnalysis?.indicators?.atr || (entryPrice * 0.008);
      const trailDistance = atr * 1.5;

      if (direction === 'LONG') {
        const candidateStop = parseFloat((currentPrice - trailDistance).toFixed(2));
        // Rule 8: Only ratchet HIGHER, never widen
        if (candidateStop > stopLoss && candidateStop > entryPrice) {
          return {
            action: POSITION_DECISION.TRAIL_STOP,
            reason: `Trailing stop ratcheted higher to ₹${candidateStop} (1.5× ATR).`,
            newStop: candidateStop,
            rMultiple,
          };
        }
      } else {
        const candidateStop = parseFloat((currentPrice + trailDistance).toFixed(2));
        // Rule 8: Only ratchet LOWER, never widen
        if (candidateStop < stopLoss && candidateStop < entryPrice) {
          return {
            action: POSITION_DECISION.TRAIL_STOP,
            reason: `Trailing stop ratcheted lower to ₹${candidateStop} (1.5× ATR).`,
            newStop: candidateStop,
            rMultiple,
          };
        }
      }
    }

    // 8. Early Exit: Opposite High-Confidence Signal or Market Structure Break
    if (latestDecision && latestDecision.confidence >= 75) {
      if (direction === 'LONG' && latestDecision.decision === 'SHORT') {
        return {
          action: POSITION_DECISION.EXIT,
          reason: `High-confidence opposite SHORT signal (${latestDecision.confidence}%). Exiting LONG early.`,
          markerType: 'FINAL EXIT',
          rMultiple,
        };
      }
      if (direction === 'SHORT' && latestDecision.decision === 'BUY') {
        return {
          action: POSITION_DECISION.EXIT,
          reason: `High-confidence opposite BUY signal (${latestDecision.confidence}%). Exiting SHORT early.`,
          markerType: 'FINAL EXIT',
          rMultiple,
        };
      }
    }

    // 9. Early Exit: Severe Structural Invalidation (BOS against position)
    if (technicalAnalysis?.structure?.breakOfStructure) {
      const bos = technicalAnalysis.structure.breakOfStructure;
      if (direction === 'LONG' && bos === 'BEARISH_BOS' && priceDiff < 0) {
        return {
          action: POSITION_DECISION.EXIT,
          reason: 'Bearish Break of Structure detected while position in drawdown. Early risk exit.',
          markerType: 'FINAL EXIT',
          rMultiple,
        };
      }
      if (direction === 'SHORT' && bos === 'BULLISH_BOS' && priceDiff < 0) {
        return {
          action: POSITION_DECISION.EXIT,
          reason: 'Bullish Break of Structure detected while position in drawdown. Early risk exit.',
          markerType: 'FINAL EXIT',
          rMultiple,
        };
      }
    }

    // 10. Default: HOLD
    return {
      action: POSITION_DECISION.HOLD,
      reason: 'Trade within parameters. Position active.',
      rMultiple,
    };
  },
};
