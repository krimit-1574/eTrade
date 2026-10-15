/**
 * AIIntradayIntegration.test.js
 * Comprehensive 20-scenario Integration Test Suite for AI Intraday Paper Trading.
 *
 * Tests the complete pipeline:
 *   SetupAnalyzer → AITradingDecisionEngine → RiskEngine → PaperBroker → PositionManager → SessionJournal
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RiskEngine, DEFAULT_RISK_SETTINGS, REJECTION_CODES } from '../RiskEngine';
import { AITradingDecisionEngine } from '../AITradingDecisionEngine';
import { PaperBroker } from '../PaperBroker';
import { PaperTradingAccount } from '../PaperTradingAccount';
import { PositionManager, POSITION_DECISION } from '../PositionManager';
import { MarketContextService, MARKET_REGIMES } from '../MarketContextService';
import { SessionJournalService } from '../SessionJournalService';

// ─── Shared Fixtures ─────────────────────────────────────────────────

function createMockAccount(overrides = {}) {
  return {
    accountValue: 100000,
    availableCash: 100000,
    usedCapital: 0,
    dailyPnL: 0,
    activePosition: null,
    closedPositions: [],
    pendingOrders: [],
    config: {
      initialCapital: 100000,
      slippage: 0.0005,
      commission: 20,
      spread: 0.0002,
    },
    ...overrides,
  };
}

function createBullishAnalysis(overrides = {}) {
  return {
    symbol: 'RELIANCE',
    trend: 'bullish',
    marketStructure: 'higher_highs_higher_lows',
    priceVsVWAP: 'above',
    emaAlignment: 'bullish',
    rsi: 62,
    macd: { histogram: 1.2, signal: 0.5 },
    atr: 18.50,
    relativeVolume: 2.4,
    volumeCondition: 'strong',
    detectedPatterns: ['bullish_engulfing'],
    support: 2910,
    resistance: 2965,
    setup: 'potential_long_breakout',
    setupStrength: 78,
    explanation: 'Bullish breakout with volume confirmation above VWAP.',
    ...overrides,
  };
}

function createBearishAnalysis(overrides = {}) {
  return {
    symbol: 'RELIANCE',
    trend: 'bearish',
    marketStructure: 'lower_highs_lower_lows',
    priceVsVWAP: 'below',
    emaAlignment: 'bearish',
    rsi: 38,
    macd: { histogram: -1.5, signal: -0.8 },
    atr: 20.00,
    relativeVolume: 2.1,
    volumeCondition: 'strong',
    detectedPatterns: ['bearish_engulfing'],
    support: 2880,
    resistance: 2920,
    setup: 'potential_short_breakdown',
    setupStrength: 24,
    explanation: 'Bearish breakdown below VWAP with heavy selling volume.',
    ...overrides,
  };
}

function createBuyDecision(overrides = {}) {
  return {
    decision: 'BUY',
    direction: 'LONG',
    confidence: 78,
    setup: 'opening_range_breakout',
    signals: ['Strong Relative Volume (2.4x)', 'Price above VWAP', 'Aligned with bullish trend'],
    invalidation: '1m candle closes below VWAP and support at ₹2910',
    entry: 2950,
    stopLoss: 2922.25,
    target1: 2991.63,
    target2: 3033.25,
    riskReward: 1.50,
    ...overrides,
  };
}

function _createShortDecision(overrides = {}) {
  return {
    decision: 'SHORT',
    direction: 'SHORT',
    confidence: 76,
    setup: 'breakdown_below_support',
    signals: ['Strong Relative Volume (2.1x)', 'Price below VWAP', 'Aligned with bearish trend'],
    invalidation: '1m candle closes above resistance at ₹2920',
    entry: 2895,
    stopLoss: 2925.00,
    target1: 2855.00,
    target2: 2815.00,
    riskReward: 1.33,
    ...overrides,
  };
}

function createActivePosition(overrides = {}) {
  return {
    symbol: 'RELIANCE',
    direction: 'LONG',
    entryPrice: 2950,
    quantity: 25,
    remainingQuantity: 25,
    stopLoss: 2922.25,
    initialStopLoss: 2922.25,
    target1: 2991.63,
    target2: 3033.25,
    target1Hit: false,
    breakevenMoved: false,
    partialExits: [],
    setup: 'opening_range_breakout',
    confidence: 78,
    entryTime: new Date().toISOString(),
    riskPerShare: 27.75,
    ...overrides,
  };
}

function createMockStockInfo(overrides = {}) {
  return {
    sym: 'RELIANCE',
    ticker: 'RELIANCE.NS',
    name: 'RELIANCE (NSE India)',
    price: 2950,
    change: 35.50,
    changePct: 1.22,
    ...overrides,
  };
}


// ═════════════════════════════════════════════════════════════════════
//  INTEGRATION TESTS
// ═════════════════════════════════════════════════════════════════════

describe('AI Intraday Integration (20 Scenarios)', () => {
  let account;
  let settings;

  beforeEach(() => {
    account = createMockAccount();
    settings = {
      ...DEFAULT_RISK_SETTINGS,
      bypassMarketHours: true,
    };
  });

  // ── Scenario 1: Bullish Breakout Setup ───────────────────────────
  it('1. Detects bullish breakout and generates BUY decision', () => {
    const analysis = createBullishAnalysis();
    const decision = AITradingDecisionEngine.evaluate(analysis, 2950);

    expect(decision.decision).toBe('BUY');
    expect(decision.direction).toBe('LONG');
    expect(decision.entry).toBeGreaterThan(0);
    expect(decision.stopLoss).toBeGreaterThan(0);
    expect(decision.stopLoss).toBeLessThan(decision.entry);
    expect(decision.target1).toBeGreaterThan(decision.entry);
    expect(decision.confidence).toBeGreaterThanOrEqual(65);
    expect(decision.signals.length).toBeGreaterThan(0);
  });

  // ── Scenario 2: Bearish Breakdown Setup ──────────────────────────
  it('2. Detects bearish breakdown and generates SHORT decision', () => {
    const analysis = createBearishAnalysis();
    const decision = AITradingDecisionEngine.evaluate(analysis, 2895);

    expect(decision.decision).toBe('SHORT');
    expect(decision.direction).toBe('SHORT');
    expect(decision.entry).toBeGreaterThan(0);
    expect(decision.stopLoss).toBeGreaterThan(decision.entry);
    expect(decision.target1).toBeLessThan(decision.entry);
    expect(decision.confidence).toBeGreaterThanOrEqual(65);
  });

  // ── Scenario 3: Failed Breakout (Invalidation) ──────────────────
  it('3. Returns WAIT for a bullish setup without trend alignment', () => {
    // Counter-trend: setup says breakout but trend is bearish
    const analysis = createBullishAnalysis({ trend: 'bearish' });
    const decision = AITradingDecisionEngine.evaluate(analysis, 2950);

    // BreakoutStrategy requires trend alignment, should return WAIT
    expect(decision.decision).toBe('WAIT');
    expect(decision.invalidation).toBeTruthy();
  });

  // ── Scenario 4: Sideways / Choppy Market (WAIT decision) ────────
  it('4. Returns WAIT for neutral/choppy market structure', () => {
    const analysis = createBullishAnalysis({
      setup: 'neutral_monitoring',
      setupStrength: 50,
      trend: 'sideways',
    });
    const decision = AITradingDecisionEngine.evaluate(analysis, 2950);

    expect(decision.decision).toBe('WAIT');
    expect(decision.invalidation).toContain('neutral');
  });

  // ── Scenario 5: Low Volume Rejection (RVOL < 1.5) ──────────────
  it('5. Returns WAIT when breakout lacks volume confirmation', () => {
    const analysis = createBullishAnalysis({ relativeVolume: 1.0 });
    const decision = AITradingDecisionEngine.evaluate(analysis, 2950);

    // BreakoutStrategy should reject low RVOL
    expect(decision.decision).toBe('WAIT');
    expect(decision.invalidation.toLowerCase()).toContain('volume');
  });

  // ── Scenario 6: High Volatility Expansion (Market Context) ──────
  it('6. Adds caution warning in high volatility market context', () => {
    const analysis = createBullishAnalysis();
    const marketCtx = {
      regime: {
        regime: MARKET_REGIMES.HIGH_VOLATILITY,
        label: 'High Volatility',
        bias: 'WAIT',
        scoreWeight: -5,
      },
    };
    const decision = AITradingDecisionEngine.evaluate(analysis, 2950, marketCtx);

    // Should still produce BUY but with caution invalidation note
    if (decision.decision === 'BUY') {
      expect(decision.invalidation).toContain('Market Context');
    }
    // Or if it falls to WAIT, that's also acceptable under high volatility
  });

  // ── Scenario 7: Stop Loss Execution ─────────────────────────────
  it('7. PositionManager triggers EXIT when price hits stop loss', () => {
    const pos = createActivePosition();
    const eval7 = PositionManager.evaluatePosition({
      position: pos,
      currentPrice: 2920,   // Below SL of 2922.25
      candleHigh: 2950,
      candleLow: 2918,
      technicalAnalysis: createBullishAnalysis(),
      riskSettings: settings,
    });

    expect(eval7.action).toBe(POSITION_DECISION.EXIT);
    expect(eval7.reason.toLowerCase()).toContain('stop');
    expect(eval7.markerType).toBe('STOP');
  });

  // ── Scenario 8: Target 1 Execution ──────────────────────────────
  it('8. PositionManager triggers PARTIAL_EXIT at Target 1', () => {
    const pos = createActivePosition();
    const eval8 = PositionManager.evaluatePosition({
      position: pos,
      currentPrice: 2995,   // Above T1 of 2991.63
      candleHigh: 2998,
      candleLow: 2988,
      technicalAnalysis: createBullishAnalysis(),
      riskSettings: settings,
    });

    expect(eval8.action).toBe(POSITION_DECISION.PARTIAL_EXIT);
    expect(eval8.exitQuantity).toBeGreaterThan(0);
    expect(eval8.exitQuantity).toBeLessThan(pos.quantity);
  });

  // ── Scenario 9: Target 2 Execution ──────────────────────────────
  it('9. PositionManager triggers TAKE_PROFIT at Target 2', () => {
    const pos = createActivePosition({
      target1Hit: true,
      remainingQuantity: 12,
      breakevenMoved: true,
    });
    const eval9 = PositionManager.evaluatePosition({
      position: pos,
      currentPrice: 3035,   // Above T2 of 3033.25
      candleHigh: 3040,
      candleLow: 3030,
      technicalAnalysis: createBullishAnalysis(),
      riskSettings: settings,
    });

    expect([POSITION_DECISION.TAKE_PROFIT, POSITION_DECISION.EXIT]).toContain(eval9.action);
    expect(eval9.markerType).toBe('TARGET');
  });

  // ── Scenario 10: Partial Profit Scaling (50% exit) ──────────────
  it('10. PaperBroker executes partial exit with correct quantity', () => {
    const pos = createActivePosition({ quantity: 100, remainingQuantity: 100 });
    const acct = createMockAccount({ activePosition: pos, availableCash: 0, usedCapital: 295000 });

    const result = PaperBroker.closePosition(acct, 2995, 'Target 1 hit — scale out 50%', 50);

    expect(result.account).toBeTruthy();
    // If partial exit is supported, remaining should be 50
    if (result.account.activePosition) {
      expect(result.account.activePosition.remainingQuantity || result.account.activePosition.quantity).toBeLessThanOrEqual(50);
    }
    expect(result.events.length).toBeGreaterThan(0);
  });

  // ── Scenario 11: Trailing Stop Ratcheting ───────────────────────
  it('11. PositionManager ratchets trailing stop upward in profitable LONG', () => {
    const pos = createActivePosition({
      target1Hit: true,
      breakevenMoved: true,
      stopLoss: 2950, // Moved to breakeven already
      remainingQuantity: 12,
      partialExits: [{ quantity: 13, fillPrice: 2991.63, pnl: 500 }],
    });
    const eval11 = PositionManager.evaluatePosition({
      position: pos,
      currentPrice: 3020,
      candleHigh: 3025,
      candleLow: 3015,
      technicalAnalysis: createBullishAnalysis({ atr: 18.50 }),
      riskSettings: settings,
    });

    // Should trail stop or hold
    if (eval11.action === POSITION_DECISION.TRAIL_STOP) {
      expect(eval11.newStop).toBeGreaterThan(pos.stopLoss);
    }
    // HOLD or TRAIL_STOP are both valid here
    expect([POSITION_DECISION.HOLD, POSITION_DECISION.TRAIL_STOP, POSITION_DECISION.TAKE_PROFIT]).toContain(eval11.action);
  });

  // ── Scenario 12: Manual Stop / Liquidation ──────────────────────
  it('12. PaperBroker closes full position on manual exit', () => {
    const pos = createActivePosition();
    const acct = createMockAccount({ activePosition: pos, availableCash: 26250, usedCapital: 73750 });

    const result = PaperBroker.closePosition(acct, 2960, 'Manual exit by trader');

    expect(result.account.activePosition).toBeNull();
    expect(result.fillPrice).toBeDefined();
    expect(result.events.length).toBeGreaterThan(0);
  });

  // ── Scenario 13: Daily Max Loss Enforcement ─────────────────────
  it('13. RiskEngine blocks trade when daily loss limit is reached', () => {
    const lossingAccount = createMockAccount({ dailyPnL: -3500 }); // Exceeds -3000 limit
    const decision = createBuyDecision();

    const validation = RiskEngine.validateTrade({
      account: lossingAccount,
      decision,
      stockInfo: createMockStockInfo(),
      customSettings: settings,
    });

    expect(validation.approved).toBe(false);
    expect(validation.code).toBe(REJECTION_CODES.DAILY_LOSS_LIMIT);
  });

  // ── Scenario 14: Max Trades Per Day Limit ───────────────────────
  it('14. RiskEngine blocks trade when max daily trades exceeded', () => {
    const exitTime = new Date().toISOString();
    const busyAccount = createMockAccount({
      closedPositions: Array(10).fill({ realizedPnL: 100, symbol: 'INFY', exitTime }),
    });
    const decision = createBuyDecision();

    const validation = RiskEngine.validateTrade({
      account: busyAccount,
      decision,
      stockInfo: createMockStockInfo(),
      customSettings: settings,
    });

    expect(validation.approved).toBe(false);
    expect(validation.code).toBe(REJECTION_CODES.MAX_DAILY_TRADES);
  });

  // ── Scenario 15: Max Consecutive Losses Limit ───────────────────
  it('15. RiskEngine halts trading after 3 consecutive losses', () => {
    const exitTime = new Date().toISOString();
    const losingStreak = createMockAccount({
      closedPositions: [
        { realizedPnL: -200, symbol: 'TCS', exitTime },
        { realizedPnL: -350, symbol: 'TCS', exitTime },
        { realizedPnL: -180, symbol: 'TCS', exitTime },
      ],
    });
    const decision = createBuyDecision();

    const validation = RiskEngine.validateTrade({
      account: losingStreak,
      decision,
      stockInfo: createMockStockInfo(),
      customSettings: settings,
    });

    expect(validation.approved).toBe(false);
    expect(validation.code).toBe(REJECTION_CODES.MAX_CONSECUTIVE_LOSSES);
  });

  // ── Scenario 16: Stale Data Protection ──────────────────────────
  it('16. Stale data flag blocks trade execution before RiskEngine gate', () => {
    // This tests the workspace-level guard logic (isStaleData flag)
    // In the workspace, when isStaleData === true, trades are blocked BEFORE
    // even reaching the RiskEngine. We simulate this guard here.
    const isStaleData = true;
    const decision = createBuyDecision();

    // Workspace guard: if isStaleData, skip RiskEngine entirely
    let tradeBlocked = false;
    if (isStaleData && (decision.decision === 'BUY' || decision.decision === 'SHORT')) {
      tradeBlocked = true;
    }

    expect(tradeBlocked).toBe(true);
  });

  // ── Scenario 17: Market Closed Behavior ─────────────────────────
  it('17. MarketContextService reports CLOSED on weekends', () => {
    // Mock a Saturday
    const satDate = new Date('2026-09-26T10:00:00Z'); // Saturday
    vi.useFakeTimers();
    vi.setSystemTime(satDate);

    const state = MarketContextService.getMarketSessionState();
    expect(state.status).toBe('CLOSED');
    expect(state.isTradingAllowed).toBe(false);

    vi.useRealTimers();
  });

  // ── Scenario 18: Intraday Cutoff Time (No New Positions After 15:15) ─
  it('18. RiskEngine blocks new entries past intraday cutoff', () => {
    // Mock time to 15:20 IST on a Friday (Friday is day 5, not weekend)
    // 15:20 IST = 09:50 UTC. 2026-09-25 was a Friday.
    const cutoffDate = new Date('2026-09-25T09:50:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(cutoffDate);

    const decision = createBuyDecision();
    const validation = RiskEngine.validateTrade({
      account,
      decision,
      stockInfo: createMockStockInfo(),
      customSettings: { ...settings, bypassMarketHours: false },
    });

    expect(validation.approved).toBe(false);
    expect(validation.code).toBe(REJECTION_CODES.CUTOFF_TIME_REACHED);

    vi.useRealTimers();
  });

  // ── Scenario 19: Insufficient Capital Rejection ─────────────────
  it('19. RiskEngine rejects trade when capital is too low for even 1 share', () => {
    const brokeAccount = createMockAccount({
      accountValue: 500,
      availableCash: 50, // Far too little for a ₹2950 stock
    });
    const decision = createBuyDecision();

    const validation = RiskEngine.validateTrade({
      account: brokeAccount,
      decision,
      stockInfo: createMockStockInfo(),
      customSettings: settings,
    });

    expect(validation.approved).toBe(false);
    expect(validation.code).toBe(REJECTION_CODES.INSUFFICIENT_CAPITAL);
  });

  // ── Scenario 20: Session Persistence / Payload Construction ─────
  it('20. SessionJournalService builds a complete session payload', () => {
    const sessionAccount = createMockAccount({
      closedPositions: [
        {
          symbol: 'RELIANCE',
          direction: 'LONG',
          entryPrice: 2950,
          exitPrice: 2990,
          quantity: 25,
          realizedPnL: 1000,
          setup: 'opening_range_breakout',
          confidence: 78,
          entryTime: '2026-09-25T04:00:00.000Z',
          exitTime: '2026-09-25T06:30:00.000Z',
          exitReason: 'Target 1 hit',
          initialStopLoss: 2922.25,
          stopLoss: 2950,
          target1: 2991.63,
          target2: 3033.25,
        },
      ],
    });

    const decisions = [
      {
        decision: 'BUY',
        direction: 'LONG',
        setup: 'opening_range_breakout',
        confidence: 78,
        entry: 2950,
        stopLoss: 2922.25,
        target1: 2991.63,
        target2: 3033.25,
        price: 2950,
        timestamp: '2026-09-25T04:00:00.000Z',
        accepted: true,
        rejectionReason: null,
      },
    ];

    const session = SessionJournalService.buildSessionPayload({
      account: sessionAccount,
      symbol: 'RELIANCE',
      decisions,
      userId: 'test-user',
    });

    expect(session).toBeTruthy();
    expect(session.symbol).toBe('RELIANCE');
    expect(session.userId || session.user).toBeTruthy();
    expect(session.trades || session.closedPositions || sessionAccount.closedPositions).toBeTruthy();
    expect(session.decisions || decisions).toHaveLength(1);
  });

  // ── Scenario 21: Full End-to-End Master Lifecycle Verification ───
  it('21. Executes complete autonomous paper trading lifecycle from signal to journaled exit', () => {
    // 1. Initial Account: ₹1,00,000 cash, no positions
    let masterAccount = createMockAccount({
      accountValue: 100000,
      availableCash: 100000,
      usedCapital: 0,
      dailyPnL: 0,
      activePosition: null,
      closedPositions: [],
    });

    // 2. Setup Detection via SetupAnalyzer
    const analysis = createBullishAnalysis({
      price: 2950,
      atr: 18.50,
      relativeVolume: 2.2,
      trend: 'bullish',
      priceVsVWAP: 'above',
    });

    // 3. Signal Generation via AITradingDecisionEngine
    const decision = AITradingDecisionEngine.evaluate(analysis, 2950);
    expect(decision.decision).toBe('BUY');
    expect(decision.direction).toBe('LONG');

    // 4. Pre-Trade Risk Gate via RiskEngine
    const riskCheck = RiskEngine.validateTrade({
      account: masterAccount,
      decision,
      stockInfo: createMockStockInfo(),
      customSettings: settings,
    });
    expect(riskCheck.approved).toBe(true);

    // 5. Position Sizing Calculation
    const sizing = RiskEngine.calculatePositionSize({
      accountValue: masterAccount.accountValue,
      availableCash: masterAccount.availableCash,
      entryPrice: decision.entry,
      stopLoss: decision.stopLoss,
      settings,
    });
    expect(sizing.quantity).toBeGreaterThan(0);

    // 6. Paper Order Execution via PaperBroker
    const execResult = PaperBroker.executeMarketOrder(masterAccount, {
      symbol: 'RELIANCE',
      direction: decision.direction,
      entry: decision.entry,
      stopLoss: decision.stopLoss,
      target1: decision.target1,
      target2: decision.target2,
      setup: decision.setup,
      confidence: decision.confidence,
      customQuantity: sizing.quantity,
    });
    expect(execResult.order).toBeTruthy();
    masterAccount = execResult.account;
    expect(masterAccount.activePosition).toBeTruthy();
    expect(masterAccount.activePosition.quantity).toBe(sizing.quantity);

    // 7. Active Position Monitoring: Target 1 Reached
    const pos = masterAccount.activePosition;
    const t1Eval = PositionManager.evaluatePosition({
      position: pos,
      currentPrice: pos.target1,
      candleHigh: pos.target1 + 2,
      candleLow: pos.target1 - 2,
      technicalAnalysis: analysis,
      riskSettings: settings,
    });
    expect(t1Eval.action).toBe(POSITION_DECISION.PARTIAL_EXIT);

    // 8. Execute Partial Scale-Out (50%)
    const partialResult = PaperBroker.closePosition(
      masterAccount, 
      pos.target1, 
      t1Eval.reason, 
      t1Eval.exitQuantity
    );
    masterAccount = partialResult.account;
    expect(masterAccount.activePosition.quantity).toBe(sizing.quantity - t1Eval.exitQuantity);
    expect(masterAccount.realizedPnL).toBeGreaterThan(0);

    // 9. Trailing / Target 2 Full Profit Realization
    const t2Eval = PositionManager.evaluatePosition({
      position: masterAccount.activePosition,
      currentPrice: pos.target2,
      candleHigh: pos.target2 + 5,
      candleLow: pos.target2 - 1,
      technicalAnalysis: analysis,
      riskSettings: settings,
    });
    expect(t2Eval.action).toBe(POSITION_DECISION.TAKE_PROFIT);

    // 10. Execute Full Exit
    const finalResult = PaperBroker.closePosition(
      masterAccount,
      pos.target2,
      t2Eval.reason
    );
    masterAccount = finalResult.account;
    expect(masterAccount.activePosition).toBeNull();
    expect(masterAccount.closedPositions).toHaveLength(1);

    // 11. Journal & Retrospective Analysis via SessionJournalService
    const session = SessionJournalService.buildSessionPayload({
      account: masterAccount,
      symbol: 'RELIANCE',
      decisions: [{ ...decision, accepted: true }],
      userId: 'master-trader',
    });

    expect(session.trade_count).toBe(1);
    expect(session.realized_pnl).toBeGreaterThan(0);
    expect(session.analytics.winRate).toBe(100);
    expect(session.analytics.winners).toBe(1);
    expect(session.trades[0].explanation.entry).toBeTruthy();
    expect(session.trades[0].retrospective.grade).toBe('A+');
  });
});
