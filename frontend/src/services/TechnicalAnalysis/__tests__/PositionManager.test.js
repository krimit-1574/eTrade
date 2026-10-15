import { describe, it, expect, beforeEach } from 'vitest';
import { PositionManager, POSITION_DECISION } from '../PositionManager';
import { PaperBroker, POSITION_STATUS } from '../PaperBroker';
import { PaperTradingAccount } from '../PaperTradingAccount';

// Mock sessionStorage for Node/Vitest test environment
const mockStorage = {};
globalThis.sessionStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = val; },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
};

describe('PositionManager', () => {
  let mockPosition;

  beforeEach(() => {
    sessionStorage.clear();
    mockPosition = {
      id: 'POS_123',
      symbol: 'RELIANCE',
      direction: 'LONG',
      quantity: 100,
      entryPrice: 1000,
      stopLoss: 980,
      initialStopLoss: 980, // Risk = 20 points
      target1: 1030,        // T1 = +1.5R (30 points)
      target2: 1060,        // T2 = +3.0R (60 points)
      partialExits: [],
      breakevenMoved: false,
    };
  });

  describe('Stop-Loss Execution', () => {
    it('triggers EXIT when low hits or breaches stop loss', () => {
      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 978,
        candleLow: 975,
        riskSettings: { intradayCutoffTime: '23:59' },
      });

      expect(evaluation.action).toBe(POSITION_DECISION.EXIT);
      expect(evaluation.reason).toBe('Stop Loss Hit');
      expect(evaluation.markerType).toBe('STOP');
    });

    it('holds when price is comfortably above stop loss', () => {
      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 1005,
        candleLow: 998,
        riskSettings: { intradayCutoffTime: '23:59' },
      });

      expect(evaluation.action).toBe(POSITION_DECISION.HOLD);
    });
  });

  describe('Target Execution & Partial Exits', () => {
    it('triggers PARTIAL_EXIT (50% scale-out) when Target 1 is reached', () => {
      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 1032,
        candleHigh: 1035,
        riskSettings: { intradayCutoffTime: '23:59' },
      });

      expect(evaluation.action).toBe(POSITION_DECISION.PARTIAL_EXIT);
      expect(evaluation.exitQuantity).toBe(50); // 100 / 2
      expect(evaluation.markerType).toBe('PARTIAL EXIT');
    });

    it('does not repeat partial exit if already taken', () => {
      mockPosition.partialExits = [{ quantity: 50, price: 1030 }];
      mockPosition.quantity = 50;

      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 1035,
        candleHigh: 1038,
        riskSettings: { intradayCutoffTime: '23:59' },
      });

      // Does not trigger partial exit again
      expect(evaluation.action).not.toBe(POSITION_DECISION.PARTIAL_EXIT);
    });

    it('triggers TAKE_PROFIT when Target 2 is reached', () => {
      mockPosition.partialExits = [{ quantity: 50, price: 1030 }];
      mockPosition.quantity = 50;

      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 1062,
        candleHigh: 1065,
        riskSettings: { intradayCutoffTime: '23:59' },
      });

      expect(evaluation.action).toBe(POSITION_DECISION.TAKE_PROFIT);
      expect(evaluation.markerType).toBe('TARGET');
    });
  });

  describe('Move to Break-Even & Trailing Stops', () => {
    it('triggers MOVE_TO_BREAKEVEN when favorable gain reaches +0.7R', () => {
      // Entry = 1000, Initial Risk = 20. +0.7R = +14 points -> Price = 1015
      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 1015,
        candleHigh: 1016,
        riskSettings: { intradayCutoffTime: '23:59' },
      });

      expect(evaluation.action).toBe(POSITION_DECISION.MOVE_TO_BREAKEVEN);
      expect(evaluation.newStop).toBeGreaterThanOrEqual(1000);
    });

    it('triggers TRAIL_STOP when price advances and ATR trail is above current stop', () => {
      mockPosition.breakevenMoved = true;
      mockPosition.partialExits = [{ quantity: 50, price: 1030 }];
      mockPosition.stopLoss = 1000;

      // Price = 1040, ATR = 10. Trail = 1040 - 15 = 1025 (> 1000)
      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 1040,
        candleHigh: 1042,
        technicalAnalysis: { indicators: { atr: 10 } },
        riskSettings: { intradayCutoffTime: '23:59' },
      });

      expect(evaluation.action).toBe(POSITION_DECISION.TRAIL_STOP);
      expect(evaluation.newStop).toBe(1025);
    });
  });

  describe('Early Exits & Invalidation', () => {
    it('forces an overnight intraday position out on the next trading day', () => {
      mockPosition.entryTime = '2026-10-13T05:00:00.000Z';

      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 1005,
        currentTime: '2026-10-14T05:00:00.000Z',
        riskSettings: { intradayCutoffTime: '15:15' },
      });

      expect(evaluation.action).toBe(POSITION_DECISION.EXIT);
      expect(evaluation.reason).toContain('Square-off enforced');
    });

    it('exits early if high-confidence opposite signal appears', () => {
      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 1005,
        latestDecision: { decision: 'SHORT', confidence: 82 },
        riskSettings: { intradayCutoffTime: '23:59' },
      });

      expect(evaluation.action).toBe(POSITION_DECISION.EXIT);
      expect(evaluation.reason).toContain('High-confidence opposite SHORT signal');
      expect(evaluation.markerType).toBe('FINAL EXIT');
    });

    it('exits early if structural breakdown (BOS against position) occurs during drawdown', () => {
      const evaluation = PositionManager.evaluatePosition({
        position: mockPosition,
        currentPrice: 995, // Drawdown: 995 < 1000
        technicalAnalysis: {
          structure: { breakOfStructure: 'BEARISH_BOS' }
        },
        riskSettings: { intradayCutoffTime: '23:59' },
      });

      expect(evaluation.action).toBe(POSITION_DECISION.EXIT);
      expect(evaluation.reason).toContain('Bearish Break of Structure');
    });
  });

  describe('PaperBroker Execution Integration', () => {
    let account;

    beforeEach(() => {
      account = PaperTradingAccount.reset({ initialCapital: 100000 });
      PaperBroker.executeMarketOrder(account, {
        symbol: 'RELIANCE',
        direction: 'LONG',
        entry: 1000,
        stopLoss: 980,
        target1: 1030,
        customQuantity: 20,
      });
    });

    it('executes a partial exit and preserves open position status', () => {
      expect(account.activePosition.quantity).toBe(20);

      // Partial exit of 10 shares @ 1030
      const result = PaperBroker.closePosition(account, 1030, 'Target 1 Reached', 10);

      expect(result.closedFully).toBe(false);
      expect(account.activePosition).not.toBeNull();
      expect(account.activePosition.quantity).toBe(10);
      expect(account.activePosition.partialExits.length).toBe(1);
      expect(account.realizedPnL).toBeGreaterThan(0);
    });

    it('prevents widening stop loss on LONG position (Rule 8)', () => {
      expect(account.activePosition.stopLoss).toBe(980);

      // Attempt to widen stop to 970 (further away) -> REJECTED
      const result = PaperBroker.updateStopLoss(account, 970, 'Widening attempt');
      expect(result.updated).toBe(false);
      expect(account.activePosition.stopLoss).toBe(980);

      // Ratchet stop higher to 995 -> ACCEPTED
      const successResult = PaperBroker.updateStopLoss(account, 995, 'Trailing stop');
      expect(successResult.updated).toBe(true);
      expect(account.activePosition.stopLoss).toBe(995);
    });
  });
});
