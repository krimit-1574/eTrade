/**
 * PaperBroker.js
 * Simulates order execution for paper trading.
 *
 * ⚠️ PAPER TRADING ONLY — NO REAL MONEY IS AT RISK.
 * This broker NEVER connects to any real exchange or broker API.
 *
 * Supports: Market, Limit, Stop, and Stop-Loss order types.
 * Applies configurable slippage, spread, and commission.
 */

import { PaperTradingAccount } from './PaperTradingAccount';

// ------- Order Status Constants -------
export const ORDER_STATUS = {
  SIGNAL_GENERATED: 'SIGNAL_GENERATED',
  CREATED: 'ORDER_CREATED',
  PENDING: 'ORDER_PENDING',
  FILLED: 'ORDER_FILLED',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  CANCELLED: 'ORDER_CANCELLED',
};

export const POSITION_STATUS = {
  OPEN: 'POSITION_OPEN',
  CLOSED: 'POSITION_CLOSED',
};

const DEFAULT_BROKER_CONFIG = {
  initialCapital: 100000,
  slippage: 0.0005,
  commission: 20,
  spread: 0.0002,
};

// ------- Helper: calculate simulated fill price -------
function calculateFillPrice(requestedPrice, direction, config = {}) {
  const cfg = config || DEFAULT_BROKER_CONFIG;
  const slippage = requestedPrice * (cfg.slippage || 0);
  const halfSpread = requestedPrice * ((cfg.spread || 0) / 2);

  if (direction === 'LONG') {
    // Buying: we get filled slightly higher (worse for buyer)
    return requestedPrice + slippage + halfSpread;
  } else {
    // Shorting: we get filled slightly lower (worse for seller)
    return requestedPrice - slippage - halfSpread;
  }
}

// ------- Placeholder Position-Sizer -------
// Deliberately separated from trading decisions.
// Part 7 will replace this with a proper risk-based engine.
function calculateQuantity(account, entryPrice) {
  if (!entryPrice || entryPrice <= 0 || !account.availableCash || account.availableCash <= 0) return 0;
  const bufferPrice = entryPrice * 1.01;
  const maxAffordable = Math.floor((account.availableCash - (account.config?.commission || 20)) / bufferPrice);
  if (maxAffordable < 1) return 0;

  // Conservative: risk 2% of available cash per trade
  const riskCapital = account.availableCash * 0.02;
  const qty = Math.floor(riskCapital / (entryPrice * 0.02));
  return Math.max(1, Math.min(qty, maxAffordable));
}

export const PaperBroker = {

  /**
   * Creates and immediately fills a MARKET order (simulated).
   * @returns {{ account, order, position, events }} 
   */
  executeMarketOrder(account, { symbol, direction, entry, stopLoss, target1, target2, setup, confidence, customQuantity, sessionId }) {
    const events = [];
    const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });

    // 1. Signal generated
    events.push({ 
      id: Date.now(), 
      time: now(), 
      title: `${direction} signal generated`, 
      detail: `Setup: ${(setup || '').replace(/_/g, ' ')}. Confidence: ${confidence}%.`, 
      type: 'active' 
    });

    // 2. Validate: no duplicate position on same symbol, and check max positions
    if (!account.activePositions) {
      account.activePositions = account.activePosition ? [account.activePosition] : [];
    }
    const cleanSym = (symbol || '').toUpperCase().replace('.NS', '');
    const config = account.config || DEFAULT_BROKER_CONFIG;
    const maxSimultaneous = config.maxSimultaneousPositions !== undefined ? config.maxSimultaneousPositions : 1;

    const existingPos = account.activePositions.find(p => (p.symbol || '').toUpperCase().replace('.NS', '') === cleanSym || p.symbol === symbol);
    if (existingPos) {
      events.push({ 
        id: Date.now() + 1, 
        time: now(), 
        title: 'Order rejected', 
        detail: `An active position for ${symbol} already exists. Close it first.`, 
        type: 'error' 
      });
      return { account, order: null, position: existingPos, events };
    }

    if (account.activePositions.length >= maxSimultaneous) {
      events.push({ 
        id: Date.now() + 1, 
        time: now(), 
        title: 'Order rejected', 
        detail: 'An active position already exists. Close it first.', 
        type: 'error' 
      });
      return { account, order: null, position: account.activePositions[0] || null, events };
    }

    // 3. Determine quantity
    let quantity = customQuantity && customQuantity > 0 ? customQuantity : calculateQuantity(account, entry);
    const commission = config.commission || 0;
    const fillPrice = parseFloat(calculateFillPrice(entry, direction, config).toFixed(2));

    // If slippage slightly pushed totalCost over available cash, scale down quantity
    while (quantity > 1 && (fillPrice * quantity + commission) > account.availableCash) {
      quantity--;
    }
    const totalCost = (fillPrice * quantity) + commission;

    // Validate: sufficient cash
    if (quantity <= 0 || totalCost > account.availableCash) {
      events.push({ 
        id: Date.now() + 2, 
        time: now(), 
        title: 'Order rejected', 
        detail: 'Insufficient paper balance.', 
        type: 'error' 
      });
      return { account, order: null, position: null, events };
    }

    // 4. Create order
    const order = {
      id: `ORD_${Date.now()}`,
      symbol: cleanSym,
      direction,
      type: 'MARKET',
      requestedPrice: entry,
      fillPrice,
      quantity,
      commission,
      status: ORDER_STATUS.FILLED,
      setup,
      confidence,
      stopLoss,
      target1,
      target2,
      sessionId: sessionId || null,
      createdAt: new Date().toISOString(),
      filledAt: new Date().toISOString(),
    };

    events.push({ 
      id: Date.now() + 3, 
      time: now(), 
      title: 'Paper order created', 
      detail: `Market ${direction} order for ${quantity} shares of ${cleanSym}.`, 
      type: 'info' 
    });

    // 5. Update account balances
    const cost = fillPrice * quantity;
    account.availableCash -= (cost + commission);

    // 6. Create position
    const position = {
      id: `POS_${Date.now()}`,
      symbol: cleanSym,
      direction,
      quantity,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      stopLoss: stopLoss ? parseFloat(stopLoss.toFixed(2)) : null,
      target1: target1 ? parseFloat(target1.toFixed(2)) : null,
      target2: target2 ? parseFloat(target2.toFixed(2)) : null,
      unrealizedPnL: 0,
      pnlPct: 0,
      status: POSITION_STATUS.OPEN,
      entryTime: new Date().toISOString(),
      orderId: order.id,
      sessionId: sessionId || null,
      setup,
    };

    account.activePositions.push(position);
    account.activePosition = account.activePositions[0] ?? null;
    account.usedCapital = account.activePositions.reduce((sum, p) => sum + (p.entryPrice * p.quantity), 0);
    account.unrealizedPnL = account.activePositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    account.accountValue = account.availableCash + account.usedCapital + account.unrealizedPnL;
    if (!account.orderHistory) account.orderHistory = [];
    account.orderHistory.push(order);

    const dirLabel = direction === 'LONG' ? 'Bought' : 'Sold short';
    events.push({ 
      id: Date.now() + 4, 
      time: now(), 
      title: `${dirLabel} ${quantity} ${symbol} @ ₹${fillPrice}`, 
      detail: `Commission: ₹${commission}. Fill includes ${(account.config.slippage * 100).toFixed(2)}% slippage.`, 
      type: 'success' 
    });

    if (stopLoss) events.push({ id: Date.now() + 5, time: now(), title: `Stop Loss set @ ₹${stopLoss.toFixed(2)}`, detail: 'Automatic stop-loss placed.', type: 'info' });
    if (target1) events.push({ id: Date.now() + 6, time: now(), title: `Target 1 set @ ₹${target1.toFixed(2)}`, detail: `Risk/Reward defined`, type: 'info' });

    PaperTradingAccount.save(account);

    return { account, order, position, events };
  },

  /**
   * Creates a simulated LIMIT order with ORDER_PENDING status.
   */
  createLimitOrder(account, { symbol, direction, limitPrice, quantity, stopLoss, target1, target2, setup, confidence, sessionId }) {
    const events = [];
    const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });

    if (!account.activePositions) {
      account.activePositions = account.activePosition ? [account.activePosition] : [];
    }
    const cleanSym = (symbol || '').toUpperCase().replace('.NS', '');
    const config = account.config || DEFAULT_BROKER_CONFIG;
    const maxSimultaneous = config.maxSimultaneousPositions !== undefined ? config.maxSimultaneousPositions : 1;

    if (account.activePositions.length >= maxSimultaneous) {
      events.push({ id: Date.now(), time: now(), title: 'Limit order rejected', detail: 'Maximum positions already reached.', type: 'error' });
      return { account, order: null, events };
    }

    if (account.activePositions.some(p => (p.symbol || '').toUpperCase().replace('.NS', '') === cleanSym || p.symbol === symbol)) {
      events.push({ id: Date.now(), time: now(), title: 'Limit order rejected', detail: `Active position already exists for ${symbol}.`, type: 'error' });
      return { account, order: null, events };
    }

    const qty = quantity && quantity > 0 ? quantity : calculateQuantity(account, limitPrice);
    if (qty <= 0 || (limitPrice * qty > account.availableCash)) {
      events.push({ id: Date.now(), time: now(), title: 'Limit order rejected', detail: 'Insufficient paper balance.', type: 'error' });
      return { account, order: null, events };
    }

    const order = {
      id: `ORD_${Date.now()}`,
      symbol,
      direction,
      type: 'LIMIT',
      requestedPrice: limitPrice,
      fillPrice: null,
      quantity: qty,
      commission: account.config.commission || 0,
      status: ORDER_STATUS.PENDING,
      setup,
      confidence,
      stopLoss,
      target1,
      target2,
      sessionId: sessionId || null,
      createdAt: new Date().toISOString(),
    };

    if (!account.pendingOrders) account.pendingOrders = [];
    account.pendingOrders.push(order);
    if (!account.orderHistory) account.orderHistory = [];
    account.orderHistory.push(order);

    events.push({
      id: Date.now() + 1,
      time: now(),
      title: `Limit ${direction} Order Placed`,
      detail: `${qty} ${symbol} @ ₹${limitPrice}. Status: PENDING.`,
      type: 'info'
    });

    PaperTradingAccount.save(account);
    return { account, order, events };
  },

  /**
   * Creates a simulated STOP order with ORDER_PENDING status.
   */
  createStopOrder(account, { symbol, direction, stopPrice, quantity, stopLoss, target1, target2, setup, confidence }) {
    const events = [];
    const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });

    if (account.activePosition) {
      events.push({ id: Date.now(), time: now(), title: 'Stop order rejected', detail: 'Active position already exists.', type: 'error' });
      return { account, order: null, events };
    }

    const qty = quantity && quantity > 0 ? quantity : calculateQuantity(account, stopPrice);
    if (qty <= 0 || (stopPrice * qty > account.availableCash)) {
      events.push({ id: Date.now(), time: now(), title: 'Stop order rejected', detail: 'Insufficient paper balance.', type: 'error' });
      return { account, order: null, events };
    }

    const order = {
      id: `ORD_${Date.now()}`,
      symbol,
      direction,
      type: 'STOP',
      requestedPrice: stopPrice,
      fillPrice: null,
      quantity: qty,
      commission: account.config.commission || 0,
      status: ORDER_STATUS.PENDING,
      setup,
      confidence,
      stopLoss,
      target1,
      target2,
      createdAt: new Date().toISOString(),
    };

    if (!account.pendingOrders) account.pendingOrders = [];
    account.pendingOrders.push(order);
    account.orderHistory.push(order);

    events.push({
      id: Date.now() + 1,
      time: now(),
      title: `Stop ${direction} Order Placed`,
      detail: `${qty} ${symbol} triggered at ₹${stopPrice}. Status: PENDING.`,
      type: 'info'
    });

    PaperTradingAccount.save(account);
    return { account, order, events };
  },

  /**
   * Cancels a pending order.
   */
  cancelOrder(account, orderId) {
    const events = [];
    const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });

    if (!account.pendingOrders) account.pendingOrders = [];
    const idx = account.pendingOrders.findIndex(o => o.id === orderId);
    if (idx === -1) {
      return { account, order: null, events };
    }

    const order = account.pendingOrders[idx];
    order.status = ORDER_STATUS.CANCELLED;
    order.cancelledAt = new Date().toISOString();
    account.pendingOrders.splice(idx, 1);

    events.push({
      id: Date.now(),
      time: now(),
      title: `Order Cancelled`,
      detail: `${order.type} ${order.direction} order for ${order.symbol} cancelled.`,
      type: 'info'
    });

    PaperTradingAccount.save(account);
    return { account, order, events };
  },

  /**
   * Evaluates pending orders against current candle or price.
   */
  evaluatePendingOrders(account, currentPrice, high, low) {
    const events = [];
    const filledOrders = [];
    if (!account.activePositions) {
      account.activePositions = account.activePosition ? [account.activePosition] : [];
    }
    if (!account.pendingOrders || account.pendingOrders.length === 0) {
      account.activePosition = account.activePositions[0] ?? null;
      return { account, filledOrders, events };
    }

    const config = account.config || DEFAULT_BROKER_CONFIG;
    const maxSimultaneous = config.maxSimultaneousPositions !== undefined ? config.maxSimultaneousPositions : 1;

    const candleHigh = high ?? currentPrice;
    const candleLow = low ?? currentPrice;
    const remainingPending = [];

    for (const order of account.pendingOrders) {
      let isTriggered = false;

      if (order.type === 'LIMIT') {
        if (order.direction === 'LONG' && candleLow <= order.requestedPrice) {
          isTriggered = true;
        } else if (order.direction === 'SHORT' && candleHigh >= order.requestedPrice) {
          isTriggered = true;
        }
      } else if (order.type === 'STOP') {
        if (order.direction === 'LONG' && candleHigh >= order.requestedPrice) {
          isTriggered = true;
        } else if (order.direction === 'SHORT' && candleLow <= order.requestedPrice) {
          isTriggered = true;
        }
      }

      const hasCapacity = account.activePositions.length < maxSimultaneous &&
        !account.activePositions.some(p => (p.symbol || '').toUpperCase().replace('.NS', '') === (order.symbol || '').toUpperCase().replace('.NS', ''));

      if (isTriggered && hasCapacity) {
        const fillPrice = parseFloat(calculateFillPrice(order.requestedPrice, order.direction, account.config).toFixed(2));
        const commission = account.config.commission || 0;
        const cost = fillPrice * order.quantity;

        order.status = ORDER_STATUS.FILLED;
        order.fillPrice = fillPrice;
        order.filledAt = new Date().toISOString();

        account.availableCash -= (cost + commission);

        const position = {
          id: `POS_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          symbol: order.symbol,
          direction: order.direction,
          quantity: order.quantity,
          entryPrice: fillPrice,
          currentPrice: fillPrice,
          stopLoss: order.stopLoss ? parseFloat(order.stopLoss.toFixed(2)) : null,
          target1: order.target1 ? parseFloat(order.target1.toFixed(2)) : null,
          target2: order.target2 ? parseFloat(order.target2.toFixed(2)) : null,
          unrealizedPnL: 0,
          pnlPct: 0,
          status: POSITION_STATUS.OPEN,
          entryTime: new Date().toISOString(),
          orderId: order.id,
          sessionId: order.sessionId || null,
          setup: order.setup,
        };

        account.activePositions.push(position);
        account.activePosition = account.activePositions[0] ?? null;
        account.usedCapital = account.activePositions.reduce((sum, p) => sum + (p.entryPrice * p.quantity), 0);
        account.unrealizedPnL = account.activePositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
        account.accountValue = account.availableCash + account.usedCapital + account.unrealizedPnL;

        filledOrders.push(order);

        const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });
        events.push({
          id: Date.now(),
          time: now(),
          title: `Pending ${order.type} Order Filled`,
          detail: `Filled ${order.quantity} ${order.symbol} @ ₹${fillPrice}.`,
          type: 'success'
        });
      } else {
        remainingPending.push(order);
      }
    }

    account.pendingOrders = remainingPending;
    account.activePosition = account.activePositions[0] ?? null;
    account.usedCapital = account.activePositions.reduce((sum, p) => sum + (p.entryPrice * p.quantity), 0);
    account.unrealizedPnL = account.activePositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    account.accountValue = account.availableCash + account.usedCapital + account.unrealizedPnL;
    PaperTradingAccount.save(account);

    return { account, filledOrders, events };
  },

  /**
   * Checks active position against Stop-Loss and Target levels.
   */
  checkPositionExitTriggers(account, currentPrice, high, low, targetSymbol = null) {
    if (!account.activePositions) {
      account.activePositions = account.activePosition ? [account.activePosition] : [];
    }

    let pos = null;
    if (targetSymbol) {
      const cleanTarget = targetSymbol.toUpperCase().replace('.NS', '');
      pos = account.activePositions.find(p => (p.symbol || '').toUpperCase().replace('.NS', '') === cleanTarget || p.symbol === targetSymbol);
      if (!pos) {
        return { account, closed: false, events: [] };
      }
    } else {
      pos = account.activePositions[0] || account.activePosition;
    }

    if (!pos) {
      return { account, closed: false, events: [] };
    }

    const candleHigh = high ?? currentPrice;
    const candleLow = low ?? currentPrice;

    if (pos.direction === 'LONG') {
      if (pos.stopLoss && candleLow <= pos.stopLoss) {
        const result = this.closePosition(account, pos.stopLoss, 'Stop Loss Hit', null, pos.symbol);
        return { account: result.account, closed: true, events: result.events };
      }
      if (pos.target1 && candleHigh >= pos.target1) {
        const result = this.closePosition(account, pos.target1, 'Target 1 Reached', null, pos.symbol);
        return { account: result.account, closed: true, events: result.events };
      }
    } else if (pos.direction === 'SHORT') {
      if (pos.stopLoss && candleHigh >= pos.stopLoss) {
        const result = this.closePosition(account, pos.stopLoss, 'Stop Loss Hit', null, pos.symbol);
        return { account: result.account, closed: true, events: result.events };
      }
      if (pos.target1 && candleLow <= pos.target1) {
        const result = this.closePosition(account, pos.target1, 'Target 1 Reached', null, pos.symbol);
        return { account: result.account, closed: true, events: result.events };
      }
    }

    return { account, closed: false, events: [] };
  },

  /**
   * Closes the active position (or a partial quantity) at the given market price.
   */
  closePosition(account, currentPrice, reason = 'Manual exit', partialQuantity = null, targetSymbol = null) {
    const events = [];
    const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });

    if (!account.activePositions) {
      account.activePositions = account.activePosition ? [account.activePosition] : [];
    }

    let pos = null;
    let posIndex = -1;

    if (targetSymbol) {
      const cleanTarget = targetSymbol.toUpperCase().replace('.NS', '');
      posIndex = account.activePositions.findIndex(p => (p.symbol || '').toUpperCase().replace('.NS', '') === cleanTarget || p.symbol === targetSymbol);
      if (posIndex >= 0) {
        pos = account.activePositions[posIndex];
      } else {
        // Explicitly requested symbol is missing -> return without mutation
        return { account, events, closedFully: false };
      }
    } else {
      if (account.activePositions.length > 0) {
        pos = account.activePositions[0];
        posIndex = 0;
      } else if (account.activePosition) {
        pos = account.activePosition;
      }
    }

    if (!pos) {
      return { account, events, closedFully: false };
    }

    const direction = pos.direction;
    const config = account.config || DEFAULT_BROKER_CONFIG;
    const fillPrice = parseFloat(calculateFillPrice(currentPrice, direction === 'LONG' ? 'SHORT' : 'LONG', config).toFixed(2));
    const commission = config.commission || 0;

    // Partial Exit Check
    if (partialQuantity && partialQuantity > 0 && partialQuantity < pos.quantity) {
      const exitQty = Math.floor(partialQuantity);
      let pnl = direction === 'LONG' 
        ? (fillPrice - pos.entryPrice) * exitQty 
        : (pos.entryPrice - fillPrice) * exitQty;
      pnl -= commission;

      account.realizedPnL = (account.realizedPnL || 0) + pnl;
      account.dailyPnL = (account.dailyPnL || 0) + pnl;

      // Return released capital + profit/loss to available cash
      const releasedCapital = pos.entryPrice * exitQty;
      account.availableCash += (releasedCapital + pnl);
      pos.quantity -= exitQty;
      if (pos.remainingQuantity !== undefined) {
        pos.remainingQuantity = pos.quantity;
      }
      account.activePosition = account.activePositions[0] ?? null;
      account.usedCapital = account.activePositions.reduce((sum, p) => sum + (p.entryPrice * p.quantity), 0);
      account.unrealizedPnL = account.activePositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
      account.accountValue = account.availableCash + account.usedCapital + account.unrealizedPnL;

      if (!pos.partialExits) pos.partialExits = [];
      pos.partialExits.push({
        quantity: exitQty,
        fillPrice,
        pnl: parseFloat(pnl.toFixed(2)),
        time: new Date().toISOString(),
        reason,
      });

      const pnlStr = pnl >= 0 ? `+₹${pnl.toFixed(2)}` : `-₹${Math.abs(pnl).toFixed(2)}`;
      const dirLabel = direction === 'LONG' ? 'Sold' : 'Covered';
      events.push({ 
        id: Date.now(), 
        time: now(), 
        title: `Partial Exit: ${dirLabel} ${exitQty} ${pos.symbol} @ ₹${fillPrice}`, 
        detail: `${reason}. Realized P&L: ${pnlStr}. Remaining: ${pos.quantity} shares.`, 
        type: 'info' 
      });

      PaperTradingAccount.save(account);
      return { account, events, closedFully: false, partialQty: exitQty, fillPrice, pnl };
    }

    // Full Exit
    let pnl;
    if (direction === 'LONG') {
      pnl = (fillPrice - pos.entryPrice) * pos.quantity;
    } else {
      pnl = (pos.entryPrice - fillPrice) * pos.quantity;
    }
    pnl -= commission;

    account.realizedPnL = (account.realizedPnL || 0) + pnl;
    account.dailyPnL = (account.dailyPnL || 0) + pnl;

    // Return released capital + profit/loss to available cash
    const releasedCapital = pos.entryPrice * pos.quantity;
    account.availableCash += (releasedCapital + pnl);

    pos.status = POSITION_STATUS.CLOSED;
    pos.exitPrice = fillPrice;
    pos.realizedPnL = parseFloat(pnl.toFixed(2));
    pos.exitTime = new Date().toISOString();
    pos.exitReason = reason;

    if (!account.closedPositions) account.closedPositions = [];
    account.closedPositions.push({ ...pos });

    if (posIndex >= 0) {
      account.activePositions.splice(posIndex, 1);
    } else {
      account.activePositions = account.activePositions.filter(p => p.id !== pos.id && p.symbol !== pos.symbol);
    }

    account.activePosition = account.activePositions[0] ?? null;
    account.usedCapital = account.activePositions.reduce((sum, p) => sum + (p.entryPrice * p.quantity), 0);
    account.unrealizedPnL = account.activePositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    account.accountValue = account.availableCash + account.usedCapital + account.unrealizedPnL;

    const pnlStr = pnl >= 0 ? `+₹${pnl.toFixed(2)}` : `-₹${Math.abs(pnl).toFixed(2)}`;
    const dirLabel = direction === 'LONG' ? 'Sold' : 'Covered';
    events.push({ 
      id: Date.now(), 
      time: now(), 
      title: `${dirLabel} ${pos.quantity} ${pos.symbol} @ ₹${fillPrice}`, 
      detail: `${reason}. Realized P&L: ${pnlStr}. Commission: ₹${commission}.`, 
      type: pnl >= 0 ? 'success' : 'error' 
    });

    PaperTradingAccount.save(account);
    return { account, events, closedFully: true, fillPrice, pnl };
  },

  /**
   * Updates Stop-Loss price on the active position.
   * Enforces Rule 8: Stop must generally never be widened.
   */
  updateStopLoss(account, newStopLoss, reason = 'Stop adjustment', targetSymbol = null) {
    const events = [];
    const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });

    if (!account.activePositions) {
      account.activePositions = account.activePosition ? [account.activePosition] : [];
    }

    let pos = null;
    if (targetSymbol) {
      const cleanTarget = targetSymbol.toUpperCase().replace('.NS', '');
      pos = account.activePositions.find(p => (p.symbol || '').toUpperCase().replace('.NS', '') === cleanTarget || p.symbol === targetSymbol);
      if (!pos) {
        return { account, updated: false, events };
      }
    } else {
      pos = account.activePositions[0] || account.activePosition;
    }

    if (!pos || !newStopLoss || newStopLoss <= 0) {
      return { account, updated: false, events };
    }

    const roundedSL = parseFloat(newStopLoss.toFixed(2));

    // Rule 8: Never widen stops
    if (pos.direction === 'LONG' && roundedSL < (pos.stopLoss || 0)) {
      return { account, updated: false, reason: 'Cannot widen Stop Loss on Long position', events };
    }
    if (pos.direction === 'SHORT' && pos.stopLoss && roundedSL > pos.stopLoss) {
      return { account, updated: false, reason: 'Cannot widen Stop Loss on Short position', events };
    }

    const oldSL = pos.stopLoss;
    pos.stopLoss = roundedSL;

    events.push({
      id: Date.now(),
      time: now(),
      title: reason,
      detail: `Stop Loss adjusted from ₹${oldSL ?? '-'} to ₹${roundedSL}.`,
      type: 'info',
    });

    PaperTradingAccount.save(account);
    return { account, updated: true, events, newStopLoss: roundedSL };
  },
};
