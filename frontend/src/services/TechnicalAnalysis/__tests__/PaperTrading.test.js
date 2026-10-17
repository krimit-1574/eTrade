import { describe, it, expect, beforeEach } from 'vitest';
import { PaperTradingAccount } from '../PaperTradingAccount';
import { PaperBroker, ORDER_STATUS, POSITION_STATUS } from '../PaperBroker';

// Mock sessionStorage for Node/Vitest environment
const mockStorage = {};
globalThis.sessionStorage = {
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

    it('refuses the symbol-less price update when multiple positions are open', () => {
      account.activePositions = [
        { symbol: 'AAA', direction: 'LONG', quantity: 1, entryPrice: 100, currentPrice: 100, unrealizedPnL: 0 },
        { symbol: 'BBB', direction: 'LONG', quantity: 1, entryPrice: 200, currentPrice: 200, unrealizedPnL: 0 },
      ];

      PaperTradingAccount.updateMarketPrice(account, 999);

      expect(account.activePositions.map(position => position.currentPrice)).toEqual([100, 200]);
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

    it('rejects an unaffordable custom market quantity instead of silently shrinking it', () => {
      account.availableCash = 1000;
      const before = JSON.stringify(account);

      const result = PaperBroker.executeMarketOrder(account, {
        symbol: 'TEST', direction: 'LONG', entry: 100,
        stopLoss: 95, target1: 110, target2: 120, customQuantity: 20,
      });

      expect(result.order).toBeNull();
      expect(result.position).toBeNull();
      expect(result.events.at(-1).detail).toMatch(/insufficient paper balance/i);
      expect(JSON.stringify(account)).toBe(before);
    });

    it('rejects fractional market quantities and inverted targets', () => {
      const fractional = PaperBroker.executeMarketOrder(account, {
        symbol: 'AAA', direction: 'LONG', entry: 100,
        stopLoss: 95, target1: 110, target2: 120, customQuantity: 1.5,
      });
      const invertedTargets = PaperBroker.executeMarketOrder(account, {
        symbol: 'BBB', direction: 'LONG', entry: 100,
        stopLoss: 95, target1: 120, target2: 110, customQuantity: 1,
      });

      expect(fractional.order).toBeNull();
      expect(invertedTargets.order).toBeNull();
      expect(account.activePositions).toHaveLength(0);
    });

    it('does not spend cash reserved by pending entries', () => {
      account = PaperTradingAccount.reset({
        initialCapital: 10000, maxSimultaneousPositions: 4, slippage: 0, spread: 0, commission: 20,
      });
      PaperBroker.createLimitOrder(account, {
        symbol: 'AAA', direction: 'LONG', limitPrice: 100,
        quantity: 60, stopLoss: 95, target1: 110,
      });

      const market = PaperBroker.executeMarketOrder(account, {
        symbol: 'BBB', direction: 'LONG', entry: 100,
        customQuantity: 50, stopLoss: 95, target1: 110,
      });

      expect(market.order).toBeNull();
      expect(account.pendingOrders).toHaveLength(1);
      expect(account.availableCash).toBe(10000);
    });

    it('rolls daily P&L before charging the first order of a new day', () => {
      account.tradingDate = '2000-01-01';
      account.dailyPnL = -500;
      account.config = { ...account.config, slippage: 0, spread: 0, commission: 20 };

      PaperBroker.executeMarketOrder(account, {
        symbol: 'AAA', direction: 'LONG', entry: 100,
        customQuantity: 1, stopLoss: 95, target1: 110,
      });

      expect(account.dailyPnL).toBe(-20);
      expect(account.tradingDate).not.toBe('2000-01-01');
    });
  });

  describe('PaperBroker - Limit and Stop Orders', () => {
    it('creates and evaluates a pending limit buy order', () => {
      const { order } = PaperBroker.createLimitOrder(account, {
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

    it('does not evaluate one stock order using another stock price', () => {
      account = PaperTradingAccount.reset({ initialCapital: 100000, maxSimultaneousPositions: 4 });
      PaperBroker.createLimitOrder(account, {
        symbol: 'TCS', direction: 'LONG', limitPrice: 3800, quantity: 5, stopLoss: 3750, target1: 3900,
      });
      PaperBroker.createLimitOrder(account, {
        symbol: 'INFY', direction: 'LONG', limitPrice: 1500, quantity: 5, stopLoss: 1470, target1: 1560,
      });

      const ambiguous = PaperBroker.evaluatePendingOrders(account, 1495, 1510, 1490);
      expect(ambiguous.filledOrders).toHaveLength(0);
      expect(ambiguous.events[0].detail).toContain('target symbol');

      const targeted = PaperBroker.evaluatePendingOrders(account, 1495, 1510, 1490, 'INFY');
      expect(targeted.filledOrders).toHaveLength(1);
      expect(targeted.filledOrders[0].symbol).toBe('INFY');
      expect(account.pendingOrders.map((order) => order.symbol)).toEqual(['TCS']);
      expect(account.realizedPnL).toBe(-20);
      expect(account.dailyPnL).toBe(-20);
    });

    it('reserves buying power across pending orders', () => {
      account = PaperTradingAccount.reset({ initialCapital: 10000, maxSimultaneousPositions: 4, slippage: 0, spread: 0, commission: 20 });
      const first = PaperBroker.createLimitOrder(account, {
        symbol: 'AAA', direction: 'LONG', limitPrice: 100, quantity: 60, stopLoss: 95, target1: 110,
      });
      const second = PaperBroker.createLimitOrder(account, {
        symbol: 'BBB', direction: 'LONG', limitPrice: 100, quantity: 60, stopLoss: 95, target1: 110,
      });

      expect(first.order).not.toBeNull();
      expect(second.order).toBeNull();
      expect(second.events[0].detail).toContain('uncommitted');
    });

    it('rejects fractional quantities and invalid protective levels', () => {
      const fractional = PaperBroker.createLimitOrder(account, {
        symbol: 'AAA', direction: 'LONG', limitPrice: 100, quantity: 1.5, stopLoss: 95, target1: 110,
      });
      const badStop = PaperBroker.createStopOrder(account, {
        symbol: 'BBB', direction: 'LONG', stopPrice: 100, quantity: 1, stopLoss: 105, target1: 110,
      });

      expect(fractional.order).toBeNull();
      expect(badStop.order).toBeNull();
    });

    it('fills stop entries at an adverse gap price, not the trigger price', () => {
      account = PaperTradingAccount.reset({ initialCapital: 100000, maxSimultaneousPositions: 4, slippage: 0, spread: 0, commission: 0 });
      PaperBroker.createStopOrder(account, {
        symbol: 'AAA', direction: 'LONG', stopPrice: 100,
        quantity: 10, stopLoss: 95, target1: 120,
      });

      const result = PaperBroker.evaluatePendingOrders(account, 110, 112, 109, 'AAA');

      expect(result.filledOrders).toHaveLength(1);
      expect(result.filledOrders[0].fillPrice).toBe(110);
      expect(account.activePositions[0].entryPrice).toBe(110);
    });

    it('gives limit entries price improvement through a favorable gap', () => {
      account = PaperTradingAccount.reset({ initialCapital: 100000, maxSimultaneousPositions: 4, slippage: 0, spread: 0, commission: 0 });
      PaperBroker.createLimitOrder(account, {
        symbol: 'AAA', direction: 'LONG', limitPrice: 100,
        quantity: 10, stopLoss: 90, target1: 120,
      });

      const result = PaperBroker.evaluatePendingOrders(account, 95, 97, 94, 'AAA');

      expect(result.filledOrders).toHaveLength(1);
      expect(result.filledOrders[0].fillPrice).toBe(95);
      expect(account.activePositions[0].entryPrice).toBe(95);
    });
  });

  describe('PaperBroker - P&L Accounting', () => {
    it('attributes every commission and recalculates unrealized P&L after a partial exit', () => {
      account = PaperTradingAccount.reset({ initialCapital: 100000, slippage: 0, spread: 0, commission: 20 });
      PaperBroker.executeMarketOrder(account, {
        symbol: 'TEST', direction: 'LONG', entry: 100, stopLoss: 95, target1: 110, target2: 120, customQuantity: 10,
      });
      PaperTradingAccount.updateMarketPrice(account, 'TEST', 110);

      const partial = PaperBroker.closePosition(account, 110, 'Target 1', 5, 'TEST');
      expect(partial.closedFully).toBe(false);
      expect(account.activePosition.quantity).toBe(5);
      expect(account.activePosition.unrealizedPnL).toBe(50);
      expect(account.activePosition.realizedPnL).toBe(10); // -20 entry + 30 partial exit
      expect(account.realizedPnL).toBe(10);

      const final = PaperBroker.closePosition(account, 120, 'Target 2', null, 'TEST');
      expect(final.closedFully).toBe(true);
      expect(account.realizedPnL).toBe(90); // 150 gross - 3 commissions
      expect(account.closedPositions[0].realizedPnL).toBe(90);
      expect(account.closedPositions[0].quantity).toBe(10);
      expect(account.closedPositions[0].finalExitQuantity).toBe(5);
      expect(account.closedPositions[0].pnlPct).toBeCloseTo(9, 4);
      expect(account.availableCash).toBe(100090);
    });

    it('rejects invalid partial quantities and exit prices without mutating the position', () => {
      account = PaperTradingAccount.reset({ initialCapital: 100000, slippage: 0, spread: 0, commission: 20 });
      PaperBroker.executeMarketOrder(account, {
        symbol: 'TEST', direction: 'LONG', entry: 100, stopLoss: 95, target1: 110, customQuantity: 10,
      });

      expect(PaperBroker.closePosition(account, 110, 'Bad partial', 0.5).closedFully).toBe(false);
      expect(PaperBroker.closePosition(account, 110, 'Bad partial', 'bad').closedFully).toBe(false);
      expect(PaperBroker.closePosition(account, 110, 'Bad partial', Number.NaN).closedFully).toBe(false);
      expect(PaperBroker.closePosition(account, Number.NaN, 'Bad price').closedFully).toBe(false);
      expect(account.activePosition.quantity).toBe(10);
      expect(account.realizedPnL).toBe(-20);
    });
  });

  describe('PaperBroker - Position Exit Triggers', () => {
    it('requires a symbol when multiple positions are open', () => {
      account.activePositions = [
        { symbol: 'AAA', direction: 'LONG', quantity: 1, entryPrice: 100, stopLoss: 95, target1: 110 },
        { symbol: 'BBB', direction: 'LONG', quantity: 1, entryPrice: 200, stopLoss: 190, target1: 220 },
      ];

      const close = PaperBroker.closePosition(account, 100);
      const stop = PaperBroker.updateStopLoss(account, 99);
      const trigger = PaperBroker.checkPositionExitTriggers(account, 90, 100, 90);

      expect(close.closedFully).toBe(false);
      expect(stop.updated).toBe(false);
      expect(trigger.closed).toBe(false);
      expect(account.activePositions).toHaveLength(2);
    });

    it('fills a breached long stop at the adverse gap price', () => {
      account = PaperTradingAccount.reset({ initialCapital: 100000, slippage: 0, spread: 0, commission: 0 });
      PaperBroker.executeMarketOrder(account, {
        symbol: 'AAA', direction: 'LONG', entry: 100,
        customQuantity: 10, stopLoss: 95, target1: 110,
      });

      const result = PaperBroker.checkPositionExitTriggers(account, 80, 90, 80, 'AAA');

      expect(result.closed).toBe(true);
      expect(account.closedPositions[0].exitPrice).toBe(80);
      expect(account.closedPositions[0].realizedPnL).toBe(-200);
    });
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
