import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api', () => ({
  api: {
    getPrice: vi.fn(async (symbol) => ({
      symbol,
      price: '100.00',
      change: '0',
      pct: '0',
      as_of: new Date().toISOString(),
      as_of_precision: 'timestamp',
      provider: 'test',
      is_delayed: false,
      freshness_limit_seconds: 90,
    })),
    getHistory: vi.fn(async () => ({ data: [] })),
    saveAISession: vi.fn(async () => ({ status: 'ok' })),
    getAISessions: vi.fn(async () => []),
    getAISession: vi.fn(async () => null),
  },
}));

import { AISessionManagerSingleton, SESSION_STATUS } from '../AISessionManager';
import { PaperBroker } from '../PaperBroker';
import { api } from '../../../api';

function createStorage() {
  const values = {};
  return {
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: (key) => { delete values[key]; },
    clear: () => { Object.keys(values).forEach(key => delete values[key]); },
  };
}

function accountWithPositions(activePositions = []) {
  return {
    ownerId: 'user-1',
    config: { initialCapital: 100000, maxSimultaneousPositions: 4, slippage: 0, spread: 0, commission: 0 },
    initialCapital: 100000,
    availableCash: 100000 - activePositions.reduce((sum, position) => sum + position.entryPrice * position.quantity, 0),
    usedCapital: activePositions.reduce((sum, position) => sum + position.entryPrice * position.quantity, 0),
    accountValue: 100000,
    realizedPnL: 0,
    unrealizedPnL: 0,
    dailyPnL: 0,
    tradingDate: '2026-10-15',
    activePosition: activePositions[0] || null,
    activePositions,
    pendingOrders: [],
    closedPositions: [],
    orderHistory: [],
  };
}

function openPosition(overrides = {}) {
  return {
    id: 'POS_1',
    symbol: 'TCS',
    direction: 'LONG',
    quantity: 10,
    originalQuantity: 10,
    entryPrice: 100,
    currentPrice: 101,
    stopLoss: 95,
    initialStopLoss: 95,
    target1: 110,
    target2: 120,
    unrealizedPnL: 10,
    realizedPnL: 0,
    status: 'POSITION_OPEN',
    entryTime: '2026-10-15T04:00:00.000Z',
    sessionId: 'session_TCS_existing',
    ...overrides,
  };
}

describe('AISessionManager lifecycle', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    api.getPrice.mockImplementation(async (symbol) => ({
      symbol,
      price: '100.00',
      change: '0',
      pct: '0',
      as_of: new Date().toISOString(),
      as_of_precision: 'timestamp',
      provider: 'test',
      is_delayed: false,
      freshness_limit_seconds: 90,
    }));
    api.getHistory.mockResolvedValue({ data: [] });
    globalThis.localStorage = createStorage();
    globalThis.sessionStorage = createStorage();
    localStorage.setItem('eTA_user', JSON.stringify({ user_id: 'user-1' }));
    manager = new AISessionManagerSingleton();
  });

  afterEach(() => {
    manager.destroy();
    vi.restoreAllMocks();
  });

  it('rehydrates and monitors every persisted open position on initialization', () => {
    const positions = [openPosition(), openPosition({ id: 'POS_2', symbol: 'INFY', sessionId: 'session_INFY_existing' })];
    manager.initialize(accountWithPositions(positions), { maxSimultaneousPositions: 4 }, 'user-1');

    expect(manager.getActiveSessions().map(session => session.symbol).sort()).toEqual(['INFY', 'TCS']);
    expect(manager.getSession('TCS').id).toBe('session_TCS_existing');
    expect(manager.getSession('TCS').status).toBe(SESSION_STATUS.POSITION_ACTIVE);
    expect(manager.getSession('TCS').isStaleData).toBe(true);
  });

  it('attaches a legacy position to its rehydrated session and prevents immediate re-entry', () => {
    const position = openPosition({ sessionId: undefined });
    manager.initialize(accountWithPositions([position]), { maxSimultaneousPositions: 4 }, 'user-1');

    const session = manager.getSession('TCS');
    expect(position.sessionId).toBe(session.id);
    expect(session.hasExecuted).toBe(true);
  });

  it('blocks an entry when the provider quote timestamp is too old', async () => {
    manager.initialize(accountWithPositions(), {
      maxSimultaneousPositions: 4,
      bypassMarketHours: true,
      bypassCutoff: true,
    }, 'user-1');
    const session = manager.startSession('TCS');
    const decision = {
      decision: 'BUY', direction: 'LONG', setup: 'breakout', confidence: 80,
      entry: 100, stopLoss: 95, target1: 110, target2: 120, riskReward: 2,
    };
    session.tradeDecision = decision;
    session.price = 100;
    session._priceStale = false;
    session._candleStale = false;
    session.isStaleData = false;
    session.lastTickTime = Date.now();
    session.quoteAsOf = new Date(Date.now() - 91_000).toISOString();
    session.quoteAsOfPrecision = 'timestamp';
    session.quoteFreshnessLimitSeconds = 90;

    await manager._attemptTradeExecution('TCS', decision, session);

    expect(manager.getAccount().activePositions).toHaveLength(0);
    expect(session.status).toBe(SESSION_STATUS.DATA_DISCONNECTED);
    expect(session.timeline.at(-1).title).toContain('Stale Data');
  });

  it('keeps monitoring when a requested stop cannot liquidate an invalid position', async () => {
    const position = openPosition({ entryPrice: 0, currentPrice: 0 });
    manager.initialize(accountWithPositions([position]), { maxSimultaneousPositions: 4 }, 'user-1');
    const session = manager.getSession('TCS');
    session.price = 0;

    const journal = await manager.stopSession('TCS');

    expect(journal).toBeNull();
    expect(session.isActive).toBe(true);
    expect(session.status).toBe(SESSION_STATUS.POSITION_ACTIVE);
    expect(manager.getAccount().activePositions).toHaveLength(1);
  });

  it('uses the persisted mark when a manual close has no live quote', async () => {
    const position = openPosition({ currentPrice: 105 });
    manager.initialize(accountWithPositions([position]), { maxSimultaneousPositions: 4 }, 'user-1');
    const session = manager.getSession('TCS');
    session.price = 0;

    const closed = await manager.manualClosePosition('TCS');

    expect(closed).toBe(true);
    expect(manager.getAccount().activePositions).toHaveLength(0);
    expect(manager.getAccount().closedPositions[0].exitPrice).toBe(105);
  });

  it('keeps a failed automatic exit active and records the failure', async () => {
    const position = openPosition({ currentPrice: 90, entryTime: new Date().toISOString() });
    manager.initialize(accountWithPositions([position]), { maxSimultaneousPositions: 4, bypassCutoff: true }, 'user-1');
    const session = manager.getSession('TCS');
    session.price = 90;
    vi.spyOn(PaperBroker, 'closePosition').mockReturnValue({
      account: manager.getAccount(),
      closedFully: false,
      events: [],
      reason: 'simulated broker rejection',
    });

    await manager._evaluatePosition('TCS', session);

    expect(manager.getAccount().activePositions).toHaveLength(1);
    expect(session.status).toBe(SESSION_STATUS.POSITION_ACTIVE);
    expect(session.timeline.at(-1).title).toBe('Automatic exit failed');
  });

  it('marks a backend timeframe fallback as display-only stale data', async () => {
    api.getHistory.mockResolvedValue({
      data: [{ time: 1, open: 100, high: 101, low: 99, close: 100, volume: 10 }],
      requestedInterval: '5m',
      effectiveInterval: '15m',
      isFallback: true,
      fallbackReason: 'test fallback',
    });
    manager.initialize(accountWithPositions(), { maxSimultaneousPositions: 4 }, 'user-1');
    const session = manager.startSession('TCS', { timeframe: '5m' });

    await manager.refreshSession('TCS');

    expect(session.chartData).toHaveLength(1);
    expect(session.dataInterval).toBe('15m');
    expect(session.isStaleData).toBe(true);
    expect(session.technicalAnalysis).toBeNull();
  });

  it('treats prior-session candles as display-only even when the interval matches', async () => {
    api.getHistory.mockResolvedValue({
      data: [{
        time: Math.floor((Date.now() - (20 * 60_000)) / 1000),
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 10,
      }],
      requestedInterval: '5m',
      effectiveInterval: '5m',
      isFallback: false,
    });
    manager.initialize(accountWithPositions(), { maxSimultaneousPositions: 4 }, 'user-1');
    const session = manager.startSession('TCS', { timeframe: '5m' });

    await manager.refreshSession('TCS');

    expect(session.chartData).toHaveLength(1);
    expect(session.candleAsOf).toBeTruthy();
    expect(session.isStaleData).toBe(true);
    expect(session.fallbackReason).toContain('candle is stale');
    expect(session.technicalAnalysis).toBeNull();
  });

  it('does not tear down monitoring when shutdown cannot liquidate a position', async () => {
    const position = openPosition({ entryPrice: 0, currentPrice: 0 });
    manager.initialize(accountWithPositions([position]), { maxSimultaneousPositions: 4 }, 'user-1');
    manager.getSession('TCS').price = 0;

    await expect(manager.shutdown()).rejects.toMatchObject({ code: 'LIQUIDATION_INCOMPLETE' });

    expect(manager.getSession('TCS')?.isActive).toBe(true);
    expect(manager.getAccount().activePositions).toHaveLength(1);
  });
});
