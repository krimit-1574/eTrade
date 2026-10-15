import { describe, it, expect, beforeEach } from 'vitest';
import { RiskEngine, DEFAULT_RISK_SETTINGS, REJECTION_CODES } from '../RiskEngine';

const MARKET_OPEN_TIME = '2026-10-14T05:30:00.000Z'; // Wednesday, 11:00 IST

describe('RiskEngine', () => {
  let defaultSettings;
  let mockAccount;

  beforeEach(() => {
    defaultSettings = { ...DEFAULT_RISK_SETTINGS };
    mockAccount = {
      accountValue: 100000,
      availableCash: 100000,
      usedCapital: 0,
      dailyPnL: 0,
      activePosition: null,
      closedPositions: [],
      pendingOrders: [],
    };
  });

  describe('Position Sizing by Risk', () => {
    it('calculates quantity correctly using risk formula', () => {
      // Risk: 1% of 100,000 = 1,000
      // Entry: 1000, SL: 980 (Risk distance: 20)
      // Raw Qty = 1000 / 20 = 50 shares
      // Capital = 50 * 1000 = 50,000. Max allocation = 25% (25,000).
      // So maxAffordableByAllocation = 25,000 / 1000 = 25 shares!
      const sizing = RiskEngine.calculatePositionSize({
        accountValue: 100000,
        availableCash: 100000,
        entryPrice: 1000,
        stopLoss: 980,
        settings: defaultSettings,
      });

      expect(sizing.riskAmount).toBe(1000);
      expect(sizing.perShareRisk).toBe(20);
      expect(sizing.quantity).toBe(25); // Constrained by 25% max capital allocation
      expect(sizing.constrainedBy).toBe('MAX_CAPITAL_ALLOCATION');
    });

    it('calculates unconstrained quantity when risk formula is below allocation limit', () => {
      // Risk: 1% of 100,000 = 1,000
      // Entry: 100, SL: 90 (Risk distance: 10)
      // Raw Qty = 1000 / 10 = 100 shares
      // Capital = 100 * 100 = 10,000 (<= 25,000 max allocation)
      const sizing = RiskEngine.calculatePositionSize({
        accountValue: 100000,
        availableCash: 100000,
        entryPrice: 100,
        stopLoss: 90,
        settings: defaultSettings,
      });

      expect(sizing.quantity).toBe(100);
      expect(sizing.capitalRequired).toBe(10000);
      expect(sizing.constrainedBy).toBe('RISK_FORMULA');
    });

    it('constrains quantity when available cash is limited', () => {
      const sizing = RiskEngine.calculatePositionSize({
        accountValue: 100000,
        availableCash: 2000, // Only 2000 cash remaining
        entryPrice: 500,
        stopLoss: 490,
        settings: defaultSettings,
      });

      expect(sizing.quantity).toBeLessThanOrEqual(3);
      expect(sizing.constrainedBy).toBe('AVAILABLE_CASH');
    });

    it('returns zero quantity when cash cannot afford even 1 share', () => {
      const sizing = RiskEngine.calculatePositionSize({
        accountValue: 100000,
        availableCash: 10,
        entryPrice: 500,
        stopLoss: 490,
        settings: defaultSettings,
      });

      expect(sizing.quantity).toBe(0);
    });
  });

  describe('Structural Stop-Loss Determination', () => {
    it('calculates long structural stop-loss using ATR and support', () => {
      const sl = RiskEngine.calculateStructuralStopLoss({
        entry: 1000,
        direction: 'LONG',
        atr: 10,
        support: 990,
      });

      // ATR stop = 1000 - 15 = 985. Support stop = 990 * 0.998 = 988.02.
      // Math.max chooses the tighter structural anchor = 988.02.
      expect(sl).toBeLessThan(1000);
      expect(sl).toBe(988.02);
    });

    it('calculates short structural stop-loss using ATR and resistance', () => {
      const sl = RiskEngine.calculateStructuralStopLoss({
        entry: 1000,
        direction: 'SHORT',
        atr: 10,
        resistance: 1010,
      });

      expect(sl).toBeGreaterThan(1000);
      expect(sl).toBe(1012.02); // 1010 * 1.002
    });
  });

  describe('Pre-Trade Validation Gate', () => {
    const validDecision = {
      decision: 'BUY',
      direction: 'LONG',
      entry: 500,
      stopLoss: 490,
      target1: 520, // R/R = 20 / 10 = 2.0
      riskReward: 2.0,
      confidence: 78,
      setup: 'breakout',
    };

    it('approves a valid trade meeting all risk rules during market hours', () => {
      // Mock market open time (11:00 AM IST)
      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: validDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: {
          ...defaultSettings,
          tradingStartTime: '00:00', // Bypass clock in unit test
          intradayCutoffTime: '23:59',
        },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(true);
      expect(validation.quantity).toBeGreaterThan(0);
    });

    it('rejects trade if confidence is below minimum', () => {
      const lowConfidenceDecision = { ...validDecision, confidence: 55 }; // 55% < 65%
      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: lowConfidenceDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: {
          ...defaultSettings,
          tradingStartTime: '00:00',
          intradayCutoffTime: '23:59',
        },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.LOW_CONFIDENCE);
    });

    it('rejects trade if Risk/Reward is below minimum', () => {
      const poorRRDecision = { ...validDecision, riskReward: 1.1 }; // 1.1 < 1.50
      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: poorRRDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: {
          ...defaultSettings,
          tradingStartTime: '00:00',
          intradayCutoffTime: '23:59',
        },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.POOR_RISK_REWARD);
    });

    it('rejects trade if daily loss limit is breached', () => {
      mockAccount.dailyPnL = -3500; // -3500 <= -3000
      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: validDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: {
          ...defaultSettings,
          tradingStartTime: '00:00',
          intradayCutoffTime: '23:59',
        },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.DAILY_LOSS_LIMIT);
    });

    it('rejects trade if maximum consecutive losses reached', () => {
      const today = new Date(MARKET_OPEN_TIME).toISOString();
      mockAccount.closedPositions = [
        { realizedPnL: -500, exitTime: today },
        { realizedPnL: -400, exitTime: today },
        { realizedPnL: -300, exitTime: today }, // 3 consecutive losses
      ];

      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: validDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: {
          ...defaultSettings,
          tradingStartTime: '00:00',
          intradayCutoffTime: '23:59',
          maxConsecutiveLosses: 3,
        },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.MAX_CONSECUTIVE_LOSSES);
    });

    it('rejects trade if post-trade cooldown is still active for symbol', () => {
      const exitJustNow = new Date(new Date(MARKET_OPEN_TIME).getTime() - 60000).toISOString(); // 1 minute ago (< 5m cooldown)
      mockAccount.closedPositions = [
        { symbol: 'RELIANCE', exitTime: exitJustNow, exitReason: 'Target 1 Reached', setup: 'other' }
      ];

      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: validDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: {
          ...defaultSettings,
          tradingStartTime: '00:00',
          intradayCutoffTime: '23:59',
          cooldownMinutes: 5,
        },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.COOLDOWN_ACTIVE);
    });

    it('blocks immediate revenge trading after stop-out', () => {
      const exitRecently = new Date(new Date(MARKET_OPEN_TIME).getTime() - 120000).toISOString(); // 2 mins ago
      mockAccount.closedPositions = [
        { symbol: 'RELIANCE', exitTime: exitRecently, exitReason: 'Stop Loss Hit', setup: 'breakout' }
      ];

      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: validDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: {
          ...defaultSettings,
          tradingStartTime: '00:00',
          intradayCutoffTime: '23:59',
          cooldownMinutes: 1, // cooldown passed, but revenge trading rule triggers
        },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.REVENGE_TRADING_BLOCKED);
    });

    it('fails closed when market data is stale', () => {
      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: validDecision,
        stockInfo: { sym: 'RELIANCE', isStaleData: true },
        customSettings: { ...defaultSettings, tradingStartTime: '00:00', intradayCutoffTime: '23:59' },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.STALE_DATA);
    });

    it('uses actual stop and target levels instead of trusting an optimistic reported ratio', () => {
      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: { ...validDecision, target1: 505, riskReward: 9 },
        stockInfo: { sym: 'RELIANCE' },
        customSettings: { ...defaultSettings, tradingStartTime: '00:00', intradayCutoffTime: '23:59' },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.POOR_RISK_REWARD);
    });

    it('compares the unrounded risk/reward ratio at the configured boundary', () => {
      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: { ...validDecision, target1: 514.95, riskReward: 1.5 },
        stockInfo: { sym: 'RELIANCE' },
        customSettings: { ...defaultSettings, tradingStartTime: '00:00', intradayCutoffTime: '23:59' },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.POOR_RISK_REWARD);
    });

    it('does not carry a prior trading day loss into the new day', () => {
      mockAccount.dailyPnL = -5000;
      mockAccount.tradingDate = '2026-10-13';

      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: validDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: { ...defaultSettings, tradingStartTime: '00:00', intradayCutoffTime: '23:59' },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(true);
    });

    it('does not manufacture buying power from account equity when cash is zero', () => {
      mockAccount.availableCash = 0;
      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: validDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: { ...defaultSettings, tradingStartTime: '00:00', intradayCutoffTime: '23:59' },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.INSUFFICIENT_CAPITAL);
    });

    it('includes live position notional in the total exposure cap', () => {
      mockAccount.activePositions = [{
        symbol: 'INFY',
        status: 'POSITION_OPEN',
        entryPrice: 700,
        currentPrice: 900,
        quantity: 89,
        entryTime: MARKET_OPEN_TIME,
      }];
      mockAccount.usedCapital = 62300;
      mockAccount.availableCash = 37700;

      const validation = RiskEngine.validateTrade({
        account: mockAccount,
        decision: validDecision,
        stockInfo: { sym: 'RELIANCE' },
        customSettings: { ...defaultSettings, tradingStartTime: '00:00', intradayCutoffTime: '23:59' },
        currentTime: MARKET_OPEN_TIME,
      });

      expect(validation.approved).toBe(false);
      expect(validation.code).toBe(REJECTION_CODES.MAX_TOTAL_EXPOSURE_REACHED);
    });
  });

  describe('Market timing', () => {
    it('uses IST consistently and rejects weekends and cutoff entries', () => {
      const saturday = RiskEngine.checkMarketTimingForEntry({
        settings: defaultSettings,
        currentTime: '2026-10-17T05:30:00.000Z',
      });
      const cutoff = RiskEngine.checkMarketTimingForEntry({
        settings: defaultSettings,
        currentTime: '2026-10-14T09:45:00.000Z', // 15:15 IST
      });

      expect(saturday.code).toBe(REJECTION_CODES.MARKET_CLOSED);
      expect(cutoff.code).toBe(REJECTION_CODES.CUTOFF_TIME_REACHED);
    });
  });
});
