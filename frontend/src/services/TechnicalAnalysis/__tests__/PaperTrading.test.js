import { describe, it, expect, beforeEach } from 'vitest';
import { PaperTradingAccount } from '../PaperTradingAccount';
import { PaperBroker, ORDER_STATUS, POSITION_STATUS } from '../PaperBroker';

// Mock sessionStorage for Node/Vitest environment
const mockStorage = {};
global.sessionStorage = {
  getItem: (key) => mockStorage[key] || null,
  setItem: (key, val) => { mockStorage[key] = val; },
  removeItem: (key) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
};

describe('Paper Trading Engine', () => {
  let account;

  beforeEach(() => {
    sessionStorage.clear();
    account = PaperTradingAccount.reset({ initialCapital: 100000 });
  });

  describe('PaperTradingAccount', () => {
    it('creates account with default capital', () => {
      expect(account.initialCapital).toBe(100000);
      expect(account.availableCash).toBe(100000);
      expect(account.realizedPnL).toBe(0);
    });

    it('persists and loads from sessionStorage', () => {
      account.realizedPnL = 500;
      PaperTradingAccount.save(account);

      const loaded = PaperTradingAccount.load();
      expect(loaded.realizedPnL).toBe(500);
    });

    it('updates unrealized P&L for long position', () => {
      account.activePosition = {
        direction: 'LONG',
        quantity: 10,
        entryPrice: 100,
        currentPrice: 100,
        unrealizedPnL: 0,
        pnlPct: 0,
      };
      account.usedCapital = 1000;
      account.availableCash = 99000;

      const updated = PaperTradingAccount.updateMarketPrice(account, 105);
      expect(updated.unrealizedPnL).toBe(50); // (105-100)*10
      expect(updated.activePosition.currentPrice).toBe(105);
    });
  });

  describe('PaperBroker - Buy Order', () => {
    it('executes a market buy order successfully', () => {
      const { account: updated, order, position, events } = PaperBroker.executeMarketOrder(account, {
        symbol: 'RELIANCE',
        direction: 'LONG',
        entry: 2945,
        stopLoss: 2929,
        target1: 2969,
        target2: 2982,
        setup: 'opening_range_breakout',
        confidence: 84,
      });

      expect(order).not.toBeNull();
      expect(order.status).toBe(ORDER_STATUS.FILLED);
      expect(order.direction).toBe('LONG');
      expect(order.fillPrice).toBeGreaterThan(2945); // Slippage makes fill higher for LONG
      expect(position.status).toBe(POSITION_STATUS.OPEN);
      expect(updated.availableCash).toBeLessThan(100000);
      expect(events.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('PaperBroker - Short Order', () => {
    it('executes a market short order', () => {
      const { order, position } = PaperBroker.executeMarketOrder(account, {
        symbol: 'INFY',
        direction: 'SHORT',
        entry: 1500,
        stopLoss: 1515,
        target1: 1477.5,
        target2: 1462.5,
        setup: 'support_breakdown',
        confidence: 72,
      });

      expect(order.direction).toBe('SHORT');
      expect(order.fillPrice).toBeLessThan(1500); // Slippage makes fill lower for SHORT
      expect(position.direction).toBe('SHORT');
    });
  });

  describe('PaperBroker - Exit Position', () => {
    it('closes long position with profit', () => {
      // First open a position
      const { account: acctWithPos } = PaperBroker.executeMarketOrder(account, {
        symbol: 'RELIANCE',
        direction: 'LONG',
        entry: 100,
        stopLoss: 98,
        target1: 103,
        target2: 105,
        setup: 'breakout',
        confidence: 80,
      });

      expect(acctWithPos.activePosition).not.toBeNull();

      // Close at a higher price
      const { account: closedAcct, events } = PaperBroker.closePosition(acctWithPos, 110, 'Target hit');

      expect(closedAcct.activePosition).toBeNull();
      expect(closedAcct.realizedPnL).toBeGreaterThan(0);
      expect(closedAcct.closedPositions.length).toBe(1);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('PaperBroker - Fees and Slippage', () => {
    it('applies commission on entry', () => {
      const { order } = PaperBroker.executeMarketOrder(account, {
        symbol: 'TEST',
        direction: 'LONG',
        entry: 100,
        stopLoss: 98,
        target1: 103,
        setup: 'test',
        confidence: 80,
      });

      expect(order.commission).toBe(20); // Default flat commission
    });

    it('applies slippage to fill price', () => {
      const { order } = PaperBroker.executeMarketOrder(account, {
        symbol: 'TEST',
        direction: 'LONG',
        entry: 1000,
        stopLoss: 990,
        target1: 1015,
        setup: 'test',
        confidence: 80,
      });

      // fillPrice should differ from requested entry by slippage + spread
      expect(order.fillPrice).not.toBe(order.requestedPrice);
      expect(order.fillPrice).toBeGreaterThan(1000);
    });
  });

  describe('PaperBroker - Invalid Orders', () => {
    it('rejects order when position already exists', () => {
      // Open first position
      const { account: acctWithPos } = PaperBroker.executeMarketOrder(account, {
        symbol: 'TEST',
        direction: 'LONG',
        entry: 100,
        stopLoss: 98,
        target1: 103,
        setup: 'test',
        confidence: 80,
      });

      // Try opening another
      const { order, events } = PaperBroker.executeMarketOrder(acctWithPos, {
        symbol: 'TEST2',
        direction: 'LONG',
        entry: 200,
        stopLoss: 196,
        target1: 206,
        setup: 'test2',
        confidence: 75,
      });

      expect(order).toBeNull();
      expect(events.some(e => e.title.includes('rejected'))).toBe(true);
    });

    it('rejects order with insufficient balance', () => {
      // Drain balance
      account.availableCash = 0;

      const { order, events } = PaperBroker.executeMarketOrder(account, {
        symbol: 'TEST',
        direction: 'LONG',
        entry: 100,
        stopLoss: 98,
        target1: 103,
        setup: 'test',
        confidence: 80,
      });

      expect(order).toBeNull();
      expect(events.some(e => e.title.includes('rejected'))).toBe(true);
    });
  });

  describe('PaperBroker - Limit and Stop Orders', () => {
    it('creates and evaluates a pending limit buy order', () => {
      const { order, events } = PaperBroker.createLimitOrder(account, {
        symbol: 'TCS',
        direction: 'LONG',
        limitPrice: 3800,
        quantity: 5,
        stopLoss: 3750,
        target1: 3900,
        setup: 'pullback',
        confidence: 85,
      });

      expect(order).not.toBeNull();
      expect(order.status).toBe(ORDER_STATUS.PENDING);
      expect(account.pendingOrders.length).toBe(1);

      // Price higher than limit -> order remains pending
      const { filledOrders: notYet } = PaperBroker.evaluatePendingOrders(account, 3850, 3860, 3820);
      expect(notYet.length).toBe(0);
      expect(account.activePosition).toBeNull();

      // Price drops to touch limit -> order fills
      const { filledOrders: filled } = PaperBroker.evaluatePendingOrders(account, 3795, 3810, 3790);
      expect(filled.length).toBe(1);
      expect(account.activePosition).not.toBeNull();
      expect(account.activePosition.symbol).toBe('TCS');
    });

    it('cancels a pending order', () => {
      const { order } = PaperBroker.createLimitOrder(account, {
        symbol: 'INFY',
        direction: 'LONG',
        limitPrice: 1500,
        quantity: 10,
        setup: 'test',
        confidence: 70,
      });

      const { order: cancelledOrder } = PaperBroker.cancelOrder(account, order.id);
      expect(cancelledOrder.status).toBe(ORDER_STATUS.CANCELLED);
      expect(account.pendingOrders.length).toBe(0);
    });
  });

  describe('PaperBroker - Position Exit Triggers', () => {
    it('auto-closes position when stop loss is hit', () => {
      PaperBroker.executeMarketOrder(account, {
        symbol: 'SBIN',
        direction: 'LONG',
        entry: 800,
        stopLoss: 780,
        target1: 840,
        setup: 'breakout',
        confidence: 80,
      });

      expect(account.activePosition).not.toBeNull();

      // Price breaches SL (low reaches 775)
      const { closed, events } = PaperBroker.checkPositionExitTriggers(account, 778, 790, 775);
      expect(closed).toBe(true);
      expect(account.activePosition).toBeNull();
      expect(events.some(e => e.detail.includes('Stop Loss Hit'))).toBe(true);
    });

    it('auto-closes position when target 1 is reached', () => {
      PaperBroker.executeMarketOrder(account, {
        symbol: 'SBIN',
        direction: 'LONG',
        entry: 800,
        stopLoss: 780,
        target1: 840,
        setup: 'breakout',
        confidence: 80,
      });

      // Price touches target (high reaches 845)
      const { closed, events } = PaperBroker.checkPositionExitTriggers(account, 842, 845, 810);
      expect(closed).toBe(true);
      expect(account.activePosition).toBeNull();
      expect(events.some(e => e.detail.includes('Target 1 Reached'))).toBe(true);
    });
  });
});

