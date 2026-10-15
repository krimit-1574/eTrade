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

let idSequence = 0;

function finiteNumber(value, fallback = null) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positivePrice(value) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function normalizeSymbol(symbol) {
  return typeof symbol === 'string'
    ? symbol.trim().toUpperCase().replace(/\.NS$/i, '')
    : '';
}

function normalizeDirection(direction) {
  return direction === 'LONG' || direction === 'SHORT' ? direction : null;
}

function createId(prefix) {
  idSequence = (idSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}_${Date.now()}_${idSequence}`;
}

function getBrokerConfig(account) {
  const raw = { ...DEFAULT_BROKER_CONFIG, ...(account?.config || {}) };
  return {
    ...raw,
    initialCapital: Math.max(0, finiteNumber(raw.initialCapital, DEFAULT_BROKER_CONFIG.initialCapital)),
    slippage: Math.max(0, finiteNumber(raw.slippage, DEFAULT_BROKER_CONFIG.slippage)),
    commission: Math.max(0, finiteNumber(raw.commission, DEFAULT_BROKER_CONFIG.commission)),
    spread: Math.max(0, finiteNumber(raw.spread, DEFAULT_BROKER_CONFIG.spread)),
    maxSimultaneousPositions: Math.max(0, Math.floor(finiteNumber(raw.maxSimultaneousPositions, 1))),
  };
}

function ensureAccountState(account) {
  if (!account || typeof account !== 'object') return false;
  PaperTradingAccount.rolloverDaily(account);
  if (!Array.isArray(account.activePositions)) account.activePositions = [];
  if (account.activePositions.length === 0 && account.activePosition && account.activePosition.status !== POSITION_STATUS.CLOSED) {
    account.activePositions.push(account.activePosition);
  }
  account.activePosition = account.activePositions[0] ?? null;
  if (!Array.isArray(account.pendingOrders)) account.pendingOrders = [];
  if (!Array.isArray(account.closedPositions)) account.closedPositions = [];
  if (!Array.isArray(account.orderHistory)) account.orderHistory = [];
  account.availableCash = Math.max(0, finiteNumber(account.availableCash, 0));
  account.realizedPnL = finiteNumber(account.realizedPnL, 0);
  account.dailyPnL = finiteNumber(account.dailyPnL, 0);
  return true;
}

function recalculateAccount(account) {
  ensureAccountState(account);
  account.usedCapital = account.activePositions.reduce((sum, position) => {
    const entryPrice = positivePrice(position?.entryPrice) || 0;
    const quantity = Math.max(0, finiteNumber(position?.quantity, 0));
    return sum + entryPrice * quantity;
  }, 0);
  account.unrealizedPnL = account.activePositions.reduce(
    (sum, position) => sum + finiteNumber(position?.unrealizedPnL, 0),
    0
  );
  account.accountValue = account.availableCash + account.usedCapital + account.unrealizedPnL;
  account.activePosition = account.activePositions[0] ?? null;
}

function syncOrderHistory(account, order) {
  if (!Array.isArray(account.orderHistory)) account.orderHistory = [];
  const index = account.orderHistory.findIndex(historyOrder => historyOrder.id === order.id);
  if (index >= 0 && account.orderHistory[index] !== order) {
    Object.assign(account.orderHistory[index], order);
  }
}

function normalizeRequestedQuantity(value) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeOptionalPrice(value) {
  if (value === null || value === undefined) return null;
  return positivePrice(value);
}

function hasValidTradeLevels(direction, entry, stopLoss, target1, target2) {
  if (!normalizeDirection(direction) || positivePrice(entry) === null) return false;
  if (stopLoss !== null && (direction === 'LONG' ? stopLoss >= entry : stopLoss <= entry)) return false;
  if (target1 !== null && (direction === 'LONG' ? target1 <= entry : target1 >= entry)) return false;
  if (target2 !== null && (direction === 'LONG' ? target2 <= entry : target2 >= entry)) return false;
  if (target1 !== null && target2 !== null && (direction === 'LONG' ? target2 <= target1 : target2 >= target1)) return false;
  return true;
}

function calculateRiskReward(direction, entryPrice, stopLoss, target1, reportedRiskReward = null) {
  const entry = positivePrice(entryPrice);
  const stop = positivePrice(stopLoss);
  const target = positivePrice(target1);
  const reported = finiteNumber(reportedRiskReward);
  let calculated = null;

  if (
    entry !== null
    && stop !== null
    && target !== null
    && normalizeDirection(direction)
    && hasValidTradeLevels(direction, entry, stop, target, null)
  ) {
    const riskDistance = Math.abs(entry - stop);
    calculated = riskDistance > 0
      ? Math.abs(target - entry) / riskDistance
      : null;
  }

  const conservativeRatio = calculated !== null && reported !== null && reported >= 0
    ? Math.min(calculated, reported)
    : (calculated ?? (reported !== null && reported >= 0 ? reported : null));
  return conservativeRatio === null ? null : parseFloat(conservativeRatio.toFixed(2));
}

function estimateOrderCommitment(order, config) {
  const price = positivePrice(order?.requestedPrice);
  const quantity = normalizeRequestedQuantity(order?.quantity);
  if (price === null || quantity <= 0) return 0;
  const slippage = Math.max(0, finiteNumber(order?.slippage, config.slippage));
  const spread = Math.max(0, finiteNumber(order?.spread, config.spread));
  const commission = Math.max(0, finiteNumber(order?.commission, config.commission));
  const adverseFillPrice = price * (1 + slippage + (spread / 2));
  return (adverseFillPrice * quantity) + commission;
}

function pendingCommitment(account, config) {
  return (account.pendingOrders || []).reduce(
    (sum, order) => sum + (order.status === ORDER_STATUS.PENDING ? estimateOrderCommitment(order, config) : 0),
    0,
  );
}

function createPendingOrder(account, type, params = {}) {
  const events = [];
  const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });
  if (!ensureAccountState(account)) return { account, order: null, events };

  const cleanSym = normalizeSymbol(params.symbol);
  const direction = normalizeDirection(params.direction);
  const requestedPrice = positivePrice(type === 'LIMIT' ? params.limitPrice : params.stopPrice);
  const stopLoss = normalizeOptionalPrice(params.stopLoss);
  const target1 = normalizeOptionalPrice(params.target1);
  const target2 = normalizeOptionalPrice(params.target2);
  const optionalPriceIsInvalid = (raw, normalized) => raw != null && normalized === null;

  if (
    !cleanSym
    || !direction
    || requestedPrice === null
    || optionalPriceIsInvalid(params.stopLoss, stopLoss)
    || optionalPriceIsInvalid(params.target1, target1)
    || optionalPriceIsInvalid(params.target2, target2)
    || !hasValidTradeLevels(direction, requestedPrice, stopLoss, target1, target2)
  ) {
    events.push({ id: createId('EVT'), time: now(), title: `${type} order rejected`, detail: 'Invalid symbol, direction, or order prices.', type: 'error' });
    return { account, order: null, events };
  }

  if (account.activePositions.some(position => normalizeSymbol(position.symbol) === cleanSym)
      || account.pendingOrders.some(order => order.status === ORDER_STATUS.PENDING && normalizeSymbol(order.symbol) === cleanSym)) {
    events.push({ id: createId('EVT'), time: now(), title: `${type} order rejected`, detail: `An active or pending order already exists for ${cleanSym}.`, type: 'error' });
    return { account, order: null, events };
  }

  const config = getBrokerConfig(account);
  const anticipatedFill = calculateFillPrice(requestedPrice, direction, config);
  if (anticipatedFill === null || !hasValidTradeLevels(direction, anticipatedFill, stopLoss, target1, target2)) {
    events.push({ id: createId('EVT'), time: now(), title: `${type} order rejected`, detail: 'Slippage would invalidate the protective stop or target levels.', type: 'error' });
    return { account, order: null, events };
  }
  if (account.activePositions.length + account.pendingOrders.filter(order => order.status === ORDER_STATUS.PENDING).length >= config.maxSimultaneousPositions) {
    events.push({ id: createId('EVT'), time: now(), title: `${type} order rejected`, detail: 'Maximum positions and pending entries already reached.', type: 'error' });
    return { account, order: null, events };
  }

  const remainingCash = Math.max(0, account.availableCash - pendingCommitment(account, config));
  const rawQuantity = params.quantity == null
    ? calculateQuantity({ ...account, availableCash: remainingCash, config }, requestedPrice)
    : normalizeRequestedQuantity(params.quantity);
  const quantityWasInvalid = params.quantity != null
    && (finiteNumber(params.quantity) === null || finiteNumber(params.quantity) !== rawQuantity);

  if (rawQuantity <= 0 || quantityWasInvalid) {
    events.push({ id: createId('EVT'), time: now(), title: `${type} order rejected`, detail: 'Quantity must be a positive whole number.', type: 'error' });
    return { account, order: null, events };
  }

  const proposedOrder = { requestedPrice, quantity: rawQuantity };
  if (estimateOrderCommitment(proposedOrder, config) > remainingCash) {
    events.push({ id: createId('EVT'), time: now(), title: `${type} order rejected`, detail: 'Insufficient uncommitted paper balance.', type: 'error' });
    return { account, order: null, events };
  }

  const order = {
    id: createId('ORD'),
    symbol: cleanSym,
    direction,
    type,
    requestedPrice,
    fillPrice: null,
    quantity: rawQuantity,
    commission: config.commission,
    slippage: config.slippage,
    spread: config.spread,
    status: ORDER_STATUS.PENDING,
    setup: params.setup || null,
    confidence: finiteNumber(params.confidence),
    riskReward: calculateRiskReward(direction, anticipatedFill, stopLoss, target1, params.riskReward),
    stopLoss,
    target1,
    target2,
    sessionId: params.sessionId || null,
    createdAt: new Date().toISOString(),
  };

  account.pendingOrders.push(order);
  account.orderHistory.push(order);
  events.push({
    id: createId('EVT'),
    time: now(),
    title: `${type} ${direction} Order Placed`,
    detail: `${rawQuantity} ${cleanSym} @ â‚¹${requestedPrice}. Status: PENDING.`,
    type: 'info',
  });

  PaperTradingAccount.save(account);
  return { account, order, events };
}

// ------- Helper: calculate simulated fill price -------
function calculateFillPrice(requestedPrice, direction, config = {}) {
  const price = positivePrice(requestedPrice);
  if (price === null || !normalizeDirection(direction)) return null;
  const cfg = { ...DEFAULT_BROKER_CONFIG, ...(config || {}) };
  const slippage = price * Math.max(0, finiteNumber(cfg.slippage, 0));
  const halfSpread = price * (Math.max(0, finiteNumber(cfg.spread, 0)) / 2);

  if (direction === 'LONG') {
    // Buying: we get filled slightly higher (worse for buyer)
    return price + slippage + halfSpread;
  } else {
    // Shorting: we get filled slightly lower (worse for seller)
    return price - slippage - halfSpread;
  }
}

// ------- Placeholder Position-Sizer -------
// Deliberately separated from trading decisions.
// Part 7 will replace this with a proper risk-based engine.
function calculateQuantity(account, entryPrice) {
  const price = positivePrice(entryPrice);
  const availableCash = finiteNumber(account?.availableCash, 0);
  if (price === null || availableCash <= 0) return 0;
  const config = getBrokerConfig(account);
  const bufferPrice = price * (1 + config.slippage + (config.spread / 2));
  const maxAffordable = Math.floor((availableCash - config.commission) / bufferPrice);
  if (maxAffordable < 1) return 0;

  // Conservative: risk 2% of available cash per trade
  const riskCapital = availableCash * 0.02;
  const qty = Math.floor(riskCapital / (price * 0.02));
  return Math.max(1, Math.min(qty, maxAffordable));
}

export const PaperBroker = {

  /**
   * Creates and immediately fills a MARKET order (simulated).
   * @returns {{ account, order, position, events }} 
   */
  executeMarketOrder(account, { symbol, direction, entry, stopLoss, target1, target2, setup, confidence, riskReward, customQuantity, sessionId } = {}) {
    const events = [];
    const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });

    if (!ensureAccountState(account)) {
      return { account, order: null, position: null, events };
    }

    const cleanSym = normalizeSymbol(symbol);
    const normalizedDirection = normalizeDirection(direction);
    const requestedEntry = positivePrice(entry);
    const normalizedStop = normalizeOptionalPrice(stopLoss);
    const normalizedTarget1 = normalizeOptionalPrice(target1);
    const normalizedTarget2 = normalizeOptionalPrice(target2);
    const invalidOptionalPrice = (value, normalized) => value !== null && value !== undefined && normalized === null;

    if (!cleanSym || !normalizedDirection || requestedEntry === null ||
        invalidOptionalPrice(stopLoss, normalizedStop) ||
        invalidOptionalPrice(target1, normalizedTarget1) ||
        invalidOptionalPrice(target2, normalizedTarget2) ||
        !hasValidTradeLevels(normalizedDirection, requestedEntry, normalizedStop, normalizedTarget1, normalizedTarget2)) {
      events.push({ id: Date.now(), time: now(), title: 'Order rejected', detail: 'Invalid symbol, direction, quantity, or trade prices.', type: 'error' });
      return { account, order: null, position: null, events };
    }

    // 1. Signal generated
    events.push({ 
      id: Date.now(), 
      time: now(), 
      title: `${normalizedDirection} signal generated`, 
      detail: `Setup: ${(setup || '').replace(/_/g, ' ')}. Confidence: ${confidence}%.`, 
      type: 'active' 
    });

    // 2. Validate: no duplicate position on same symbol, and check max positions
    const config = getBrokerConfig(account);
    const maxSimultaneous = config.maxSimultaneousPositions;

    const existingPos = account.activePositions.find(p => normalizeSymbol(p.symbol) === cleanSym);
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

    if (account.pendingOrders.some(order => order.status === ORDER_STATUS.PENDING && normalizeSymbol(order.symbol) === cleanSym)) {
      events.push({ id: Date.now() + 1, time: now(), title: 'Order rejected', detail: `A pending order for ${cleanSym} already exists.`, type: 'error' });
      return { account, order: null, position: null, events };
    }

    const activePendingCount = account.pendingOrders.filter(order => order.status === ORDER_STATUS.PENDING).length;
    if (account.activePositions.length + activePendingCount >= maxSimultaneous) {
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
    const hasCustomQuantity = customQuantity !== null && customQuantity !== undefined;
    let quantity = hasCustomQuantity ? normalizeRequestedQuantity(customQuantity) : calculateQuantity(account, requestedEntry);
    const parsedCustomQuantity = hasCustomQuantity ? finiteNumber(customQuantity) : null;
    if (hasCustomQuantity && (quantity <= 0 || parsedCustomQuantity !== quantity)) {
      events.push({ id: Date.now() + 2, time: now(), title: 'Order rejected', detail: 'Quantity must be a positive whole number.', type: 'error' });
      return { account, order: null, position: null, events };
    }
    const commission = config.commission;
    const uncommittedCash = Math.max(0, account.availableCash - pendingCommitment(account, config));
    if (!hasCustomQuantity) {
      quantity = calculateQuantity({ ...account, availableCash: uncommittedCash, config }, requestedEntry);
    }
    const fillPrice = parseFloat(calculateFillPrice(requestedEntry, normalizedDirection, config).toFixed(2));
    if (!hasValidTradeLevels(normalizedDirection, fillPrice, normalizedStop, normalizedTarget1, normalizedTarget2)) {
      events.push({ id: createId('EVT'), time: now(), title: 'Order rejected', detail: 'Slippage would invalidate the protective stop or target levels.', type: 'error' });
      return { account, order: null, position: null, events };
    }

    // A risk-approved/custom quantity is an instruction, not a suggestion. If it
    // cannot be funded after simulated execution costs, reject it instead of
    // silently opening a smaller position than the risk/audit trail records.
    if (hasCustomQuantity && (fillPrice * quantity + commission) > uncommittedCash) {
      events.push({
        id: createId('EVT'),
        time: now(),
        title: 'Order rejected',
        detail: 'Insufficient paper balance for the requested quantity.',
        type: 'error',
      });
      return { account, order: null, position: null, events };
    }

    // Auto-sized orders may be reduced if execution costs consume the small
    // affordability buffer between the quote and the simulated fill.
    while (!hasCustomQuantity && quantity > 1 && (fillPrice * quantity + commission) > uncommittedCash) {
      quantity--;
    }
    const totalCost = (fillPrice * quantity) + commission;

    // Validate: sufficient cash
    if (quantity <= 0 || totalCost > uncommittedCash) {
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
      id: createId('ORD'),
      symbol: cleanSym,
      direction: normalizedDirection,
      type: 'MARKET',
      requestedPrice: requestedEntry,
      fillPrice,
      quantity,
      originalQuantity: quantity,
      commission,
      status: ORDER_STATUS.FILLED,
      setup,
      confidence: finiteNumber(confidence),
      riskReward: calculateRiskReward(normalizedDirection, fillPrice, normalizedStop, normalizedTarget1, riskReward),
      stopLoss: normalizedStop,
      target1: normalizedTarget1,
      target2: normalizedTarget2,
      sessionId: sessionId || null,
      createdAt: new Date().toISOString(),
      filledAt: new Date().toISOString(),
    };

    events.push({ 
      id: Date.now() + 3, 
      time: now(), 
      title: 'Paper order created', 
      detail: `Market ${normalizedDirection} order for ${quantity} shares of ${cleanSym}.`, 
      type: 'info' 
    });

    // 5. Update account balances
    const cost = fillPrice * quantity;
    account.availableCash -= (cost + commission);
    account.realizedPnL -= commission;
    account.dailyPnL -= commission;

    // 6. Create position
    const position = {
      id: createId('POS'),
      symbol: cleanSym,
      direction: normalizedDirection,
      quantity,
      originalQuantity: quantity,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      stopLoss: normalizedStop !== null ? parseFloat(normalizedStop.toFixed(2)) : null,
      initialStopLoss: normalizedStop !== null ? parseFloat(normalizedStop.toFixed(2)) : null,
      target1: normalizedTarget1 !== null ? parseFloat(normalizedTarget1.toFixed(2)) : null,
      target2: normalizedTarget2 !== null ? parseFloat(normalizedTarget2.toFixed(2)) : null,
      remainingQuantity: quantity,
      entryCommission: commission,
      realizedPnL: -commission,
      unrealizedPnL: 0,
      pnlPct: 0,
      status: POSITION_STATUS.OPEN,
      entryTime: new Date().toISOString(),
      orderId: order.id,
      sessionId: sessionId || null,
      setup,
      confidence: finiteNumber(confidence),
      riskReward: calculateRiskReward(normalizedDirection, fillPrice, normalizedStop, normalizedTarget1, riskReward),
    };

    account.activePositions.push(position);
    recalculateAccount(account);
    account.orderHistory.push(order);

    const dirLabel = normalizedDirection === 'LONG' ? 'Bought' : 'Sold short';
    events.push({ 
      id: Date.now() + 4, 
      time: now(), 
      title: `${dirLabel} ${quantity} ${symbol} @ ₹${fillPrice}`, 
      detail: `Commission: ₹${commission}. Fill includes ${(config.slippage * 100).toFixed(2)}% slippage.`,
      type: 'success' 
    });

    if (normalizedStop !== null) events.push({ id: createId('EVT'), time: now(), title: `Stop Loss set @ ₹${normalizedStop.toFixed(2)}`, detail: 'Automatic stop-loss placed.', type: 'info' });
    if (normalizedTarget1 !== null) events.push({ id: createId('EVT'), time: now(), title: `Target 1 set @ ₹${normalizedTarget1.toFixed(2)}`, detail: 'Risk/Reward defined', type: 'info' });

    PaperTradingAccount.save(account);

    return { account, order, position, events };
  },

  /**
   * Creates a simulated LIMIT order with ORDER_PENDING status.
   */
  createLimitOrder(account, params = {}) {
    return createPendingOrder(account, 'LIMIT', params);
  },

  /**
   * Creates a simulated STOP order with ORDER_PENDING status.
   */
  createStopOrder(account, params = {}) {
    return createPendingOrder(account, 'STOP', params);
  },

  /**
   * Cancels a pending order.
   */
  cancelOrder(account, orderId) {
    const events = [];
    const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });

    if (!ensureAccountState(account) || typeof orderId !== 'string' || !orderId) {
      return { account, order: null, events };
    }
    const idx = account.pendingOrders.findIndex(o => o.id === orderId);
    if (idx === -1) {
      return { account, order: null, events };
    }

    const order = account.pendingOrders[idx];
    order.status = ORDER_STATUS.CANCELLED;
    order.cancelledAt = new Date().toISOString();
    syncOrderHistory(account, order);
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
  evaluatePendingOrders(account, currentPrice, high, low, targetSymbol = null) {
    const events = [];
    const filledOrders = [];
    if (!ensureAccountState(account) || account.pendingOrders.length === 0) {
      return { account, filledOrders, events };
    }

    const marketPrice = positivePrice(currentPrice);
    const candleHigh = positivePrice(high ?? currentPrice);
    const candleLow = positivePrice(low ?? currentPrice);
    if (marketPrice === null || candleHigh === null || candleLow === null || candleHigh < candleLow) {
      return { account, filledOrders, events };
    }

    const pendingSymbols = [...new Set(account.pendingOrders.map(order => normalizeSymbol(order.symbol)).filter(Boolean))];
    const cleanTarget = targetSymbol == null
      ? (pendingSymbols.length === 1 ? pendingSymbols[0] : null)
      : normalizeSymbol(targetSymbol);
    if (!cleanTarget) {
      events.push({
        id: createId('EVT'),
        time: new Date().toLocaleTimeString('en-US', { hour12: true }),
        title: 'Pending orders not evaluated',
        detail: 'A target symbol is required when orders exist for multiple stocks.',
        type: 'error',
      });
      return { account, filledOrders, events };
    }

    const config = getBrokerConfig(account);
    const remainingPending = [];

    for (const order of account.pendingOrders) {
      if (order.status !== ORDER_STATUS.PENDING || normalizeSymbol(order.symbol) !== cleanTarget) {
        remainingPending.push(order);
        continue;
      }

      const requestedPrice = positivePrice(order.requestedPrice);
      const quantity = normalizeRequestedQuantity(order.quantity);
      const isTriggered = requestedPrice !== null && (
        (order.type === 'LIMIT' && order.direction === 'LONG' && candleLow <= requestedPrice)
        || (order.type === 'LIMIT' && order.direction === 'SHORT' && candleHigh >= requestedPrice)
        || (order.type === 'STOP' && order.direction === 'LONG' && candleHigh >= requestedPrice)
        || (order.type === 'STOP' && order.direction === 'SHORT' && candleLow <= requestedPrice)
      );

      if (!isTriggered) {
        remainingPending.push(order);
        continue;
      }

      const hasCapacity = account.activePositions.length < config.maxSimultaneousPositions
        && !account.activePositions.some(position => normalizeSymbol(position.symbol) === cleanTarget);
      const orderConfig = {
        ...config,
        commission: Math.max(0, finiteNumber(order.commission, config.commission)),
        slippage: Math.max(0, finiteNumber(order.slippage, config.slippage)),
        spread: Math.max(0, finiteNumber(order.spread, config.spread)),
      };
      let executionBase = requestedPrice;
      if (order.type === 'LIMIT' && requestedPrice !== null) {
        executionBase = order.direction === 'LONG'
          ? Math.min(requestedPrice, marketPrice)
          : Math.max(requestedPrice, marketPrice);
      } else if (order.type === 'STOP' && requestedPrice !== null) {
        executionBase = order.direction === 'LONG'
          ? Math.max(requestedPrice, marketPrice)
          : Math.min(requestedPrice, marketPrice);
      }
      let simulatedFill = executionBase === null ? null : calculateFillPrice(executionBase, order.direction, orderConfig);
      // A limit order may improve through a favorable gap, but can never fill
      // beyond its limit after simulated spread/slippage is applied.
      if (simulatedFill !== null && order.type === 'LIMIT') {
        simulatedFill = order.direction === 'LONG'
          ? Math.min(simulatedFill, requestedPrice)
          : Math.max(simulatedFill, requestedPrice);
      }
      const fillPrice = simulatedFill === null ? null : parseFloat(simulatedFill.toFixed(2));
      const totalCost = fillPrice === null ? Number.POSITIVE_INFINITY : (fillPrice * quantity) + orderConfig.commission;

      if (fillPrice !== null && !hasValidTradeLevels(order.direction, fillPrice, order.stopLoss, order.target1, order.target2)) {
        order.status = ORDER_STATUS.CANCELLED;
        order.cancelledAt = new Date().toISOString();
        syncOrderHistory(account, order);
        events.push({
          id: createId('EVT'),
          time: new Date().toLocaleTimeString('en-US', { hour12: true }),
          title: `Pending ${order.type} Order Cancelled`,
          detail: 'The gap-adjusted fill would invalidate its protective stop or target levels.',
          type: 'error',
        });
        continue;
      }

      if (!hasCapacity || quantity <= 0 || totalCost > account.availableCash) {
        remainingPending.push(order);
        events.push({
          id: createId('EVT'),
          time: new Date().toLocaleTimeString('en-US', { hour12: true }),
          title: `Pending ${order.type} Order Deferred`,
          detail: !hasCapacity ? 'Position capacity is unavailable.' : 'Available paper balance no longer covers this order.',
          type: 'error',
        });
        continue;
      }

      order.status = ORDER_STATUS.FILLED;
      order.fillPrice = fillPrice;
      order.filledAt = new Date().toISOString();
      syncOrderHistory(account, order);

      account.availableCash -= totalCost;
      account.realizedPnL -= orderConfig.commission;
      account.dailyPnL -= orderConfig.commission;

      account.activePositions.push({
        id: createId('POS'),
        symbol: cleanTarget,
        direction: order.direction,
        quantity,
        originalQuantity: quantity,
        remainingQuantity: quantity,
        entryPrice: fillPrice,
        currentPrice: fillPrice,
        stopLoss: order.stopLoss,
        initialStopLoss: order.stopLoss,
        target1: order.target1,
        target2: order.target2,
        entryCommission: orderConfig.commission,
        realizedPnL: -orderConfig.commission,
        unrealizedPnL: 0,
        pnlPct: 0,
        status: POSITION_STATUS.OPEN,
        entryTime: new Date().toISOString(),
        orderId: order.id,
        sessionId: order.sessionId || null,
        setup: order.setup,
        confidence: order.confidence,
        riskReward: calculateRiskReward(order.direction, fillPrice, order.stopLoss, order.target1, order.riskReward),
      });
      filledOrders.push(order);
      events.push({
        id: createId('EVT'),
        time: new Date().toLocaleTimeString('en-US', { hour12: true }),
        title: `Pending ${order.type} Order Filled`,
        detail: `Filled ${quantity} ${cleanTarget} @ ₹${fillPrice}.`,
        type: 'success',
      });
    }

    account.pendingOrders = remainingPending;
    recalculateAccount(account);
    PaperTradingAccount.save(account);
    return { account, filledOrders, events };
  },

  /**
   * Checks active position against Stop-Loss and Target levels.
   */
  checkPositionExitTriggers(account, currentPrice, high, low, targetSymbol = null) {
    if (!ensureAccountState(account)) return { account, closed: false, events: [] };

    if (!targetSymbol && account.activePositions.length > 1) {
      return {
        account,
        closed: false,
        events: [{
          id: createId('EVT'),
          time: new Date().toLocaleTimeString('en-US', { hour12: true }),
          title: 'Exit triggers not evaluated',
          detail: 'A target symbol is required when multiple positions are open.',
          type: 'error',
        }],
      };
    }

    let pos = null;
    if (targetSymbol) {
      const cleanTarget = normalizeSymbol(targetSymbol);
      pos = account.activePositions.find(position => normalizeSymbol(position.symbol) === cleanTarget);
      if (!pos) {
        return { account, closed: false, events: [] };
      }
    } else {
      pos = account.activePositions[0] || account.activePosition;
    }

    if (!pos) {
      return { account, closed: false, events: [] };
    }

    const marketPrice = positivePrice(currentPrice);
    const candleHigh = positivePrice(high ?? currentPrice);
    const candleLow = positivePrice(low ?? currentPrice);
    if (marketPrice === null || candleHigh === null || candleLow === null || candleHigh < candleLow) {
      return { account, closed: false, events: [] };
    }
    const stopLoss = positivePrice(pos.stopLoss);
    const target1 = positivePrice(pos.target1);

    if (pos.direction === 'LONG') {
      if (stopLoss !== null && candleLow <= stopLoss) {
        const result = this.closePosition(account, Math.min(stopLoss, marketPrice), 'Stop Loss Hit', null, pos.symbol);
        return { account: result.account, closed: result.closedFully === true, events: result.events };
      }
      if (target1 !== null && candleHigh >= target1) {
        const result = this.closePosition(account, target1, 'Target 1 Reached', null, pos.symbol);
        return { account: result.account, closed: result.closedFully === true, events: result.events };
      }
    } else if (pos.direction === 'SHORT') {
      if (stopLoss !== null && candleHigh >= stopLoss) {
        const result = this.closePosition(account, Math.max(stopLoss, marketPrice), 'Stop Loss Hit', null, pos.symbol);
        return { account: result.account, closed: result.closedFully === true, events: result.events };
      }
      if (target1 !== null && candleLow <= target1) {
        const result = this.closePosition(account, target1, 'Target 1 Reached', null, pos.symbol);
        return { account: result.account, closed: result.closedFully === true, events: result.events };
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

    if (!ensureAccountState(account)) return { account, events, closedFully: false };

    if (!targetSymbol && account.activePositions.length > 1) {
      return { account, events, closedFully: false, reason: 'A target symbol is required when multiple positions are open' };
    }

    let pos = null;
    let posIndex = -1;

    if (targetSymbol) {
      const cleanTarget = normalizeSymbol(targetSymbol);
      posIndex = account.activePositions.findIndex(position => normalizeSymbol(position.symbol) === cleanTarget);
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

    const direction = normalizeDirection(pos.direction);
    const entryPrice = positivePrice(pos.entryPrice);
    const openQuantity = normalizeRequestedQuantity(pos.quantity);
    const previouslyExitedQuantity = Array.isArray(pos.partialExits)
      ? pos.partialExits.reduce((sum, exit) => sum + normalizeRequestedQuantity(exit?.quantity), 0)
      : 0;
    const originalQuantity = Math.max(
      openQuantity,
      normalizeRequestedQuantity(pos.originalQuantity),
      openQuantity + previouslyExitedQuantity,
    );
    const requestedExit = positivePrice(currentPrice);
    const config = getBrokerConfig(account);
    const simulatedFill = requestedExit === null || direction === null
      ? null
      : calculateFillPrice(requestedExit, direction === 'LONG' ? 'SHORT' : 'LONG', config);
    if (direction === null || entryPrice === null || openQuantity <= 0 || simulatedFill === null) {
      return { account, events, closedFully: false, reason: 'Invalid position or exit price' };
    }
    const fillPrice = parseFloat(simulatedFill.toFixed(2));
    const commission = config.commission;
    const hasExplicitPartial = partialQuantity !== null && partialQuantity !== undefined;
    const requestedPartial = hasExplicitPartial ? finiteNumber(partialQuantity) : null;
    if (hasExplicitPartial && (
      requestedPartial === null
      || !Number.isInteger(requestedPartial)
      || requestedPartial <= 0
      || requestedPartial > openQuantity
    )) {
      return { account, events, closedFully: false, reason: 'Partial exit quantity must be a positive whole number no greater than the open quantity' };
    }

    // Partial Exit Check
    if (requestedPartial !== null && requestedPartial < openQuantity) {
      const exitQty = requestedPartial;
      let pnl = direction === 'LONG' 
        ? (fillPrice - entryPrice) * exitQty
        : (entryPrice - fillPrice) * exitQty;
      pnl -= commission;

      account.realizedPnL = finiteNumber(account.realizedPnL, 0) + pnl;
      account.dailyPnL = finiteNumber(account.dailyPnL, 0) + pnl;
      pos.realizedPnL = finiteNumber(pos.realizedPnL, 0) + pnl;
      pos.originalQuantity = originalQuantity;

      // Return released capital + profit/loss to available cash
      const releasedCapital = entryPrice * exitQty;
      account.availableCash += (releasedCapital + pnl);
      pos.quantity -= exitQty;
      pos.currentPrice = fillPrice;
      pos.unrealizedPnL = direction === 'LONG'
        ? (fillPrice - entryPrice) * pos.quantity
        : (entryPrice - fillPrice) * pos.quantity;
      pos.pnlPct = pos.quantity > 0 ? (pos.unrealizedPnL / (entryPrice * pos.quantity)) * 100 : 0;
      if (pos.remainingQuantity !== undefined) {
        pos.remainingQuantity = pos.quantity;
      }
      recalculateAccount(account);

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
    let exitPnL;
    if (direction === 'LONG') {
      exitPnL = (fillPrice - entryPrice) * openQuantity;
    } else {
      exitPnL = (entryPrice - fillPrice) * openQuantity;
    }
    exitPnL -= commission;

    account.realizedPnL = finiteNumber(account.realizedPnL, 0) + exitPnL;
    account.dailyPnL = finiteNumber(account.dailyPnL, 0) + exitPnL;

    // Return released capital + profit/loss to available cash
    const releasedCapital = entryPrice * openQuantity;
    account.availableCash += (releasedCapital + exitPnL);

    pos.status = POSITION_STATUS.CLOSED;
    pos.currentPrice = fillPrice;
    pos.exitPrice = fillPrice;
    pos.realizedPnL = parseFloat((finiteNumber(pos.realizedPnL, 0) + exitPnL).toFixed(2));
    pos.unrealizedPnL = 0;
    pos.originalQuantity = originalQuantity;
    pos.pnlPct = entryPrice * originalQuantity > 0
      ? parseFloat(((pos.realizedPnL / (entryPrice * originalQuantity)) * 100).toFixed(4))
      : 0;
    pos.remainingQuantity = 0;
    pos.exitTime = new Date().toISOString();
    pos.exitReason = reason;

    if (!account.closedPositions) account.closedPositions = [];
    account.closedPositions.push({
      ...pos,
      quantity: originalQuantity,
      originalQuantity,
      finalExitQuantity: openQuantity,
    });

    if (posIndex >= 0) {
      account.activePositions.splice(posIndex, 1);
    } else {
      account.activePositions = account.activePositions.filter(p => p.id !== pos.id && p.symbol !== pos.symbol);
    }

    recalculateAccount(account);

    const pnlStr = pos.realizedPnL >= 0 ? `+₹${pos.realizedPnL.toFixed(2)}` : `-₹${Math.abs(pos.realizedPnL).toFixed(2)}`;
    const dirLabel = direction === 'LONG' ? 'Sold' : 'Covered';
    events.push({ 
      id: Date.now(), 
      time: now(), 
      title: `${dirLabel} ${openQuantity} ${pos.symbol} @ ₹${fillPrice}`,
      detail: `${reason}. Realized P&L: ${pnlStr}. Commission: ₹${commission}.`, 
      type: pos.realizedPnL >= 0 ? 'success' : 'error'
    });

    PaperTradingAccount.save(account);
    return { account, events, closedFully: true, fillPrice, pnl: pos.realizedPnL };
  },

  /**
   * Updates Stop-Loss price on the active position.
   * Enforces Rule 8: Stop must generally never be widened.
   */
  updateStopLoss(account, newStopLoss, reason = 'Stop adjustment', targetSymbol = null) {
    const events = [];
    const now = () => new Date().toLocaleTimeString('en-US', { hour12: true });

    if (!ensureAccountState(account)) return { account, updated: false, events };

    if (!targetSymbol && account.activePositions.length > 1) {
      return { account, updated: false, reason: 'A target symbol is required when multiple positions are open', events };
    }

    let pos = null;
    if (targetSymbol) {
      const cleanTarget = normalizeSymbol(targetSymbol);
      pos = account.activePositions.find(position => normalizeSymbol(position.symbol) === cleanTarget);
      if (!pos) {
        return { account, updated: false, events };
      }
    } else {
      pos = account.activePositions[0] || account.activePosition;
    }

    const parsedStop = positivePrice(newStopLoss);
    const direction = normalizeDirection(pos?.direction);
    const currentPrice = positivePrice(pos?.currentPrice ?? pos?.entryPrice);
    if (!pos || parsedStop === null || direction === null || currentPrice === null) {
      return { account, updated: false, events };
    }

    const roundedSL = parseFloat(parsedStop.toFixed(2));
    if ((direction === 'LONG' && roundedSL >= currentPrice) || (direction === 'SHORT' && roundedSL <= currentPrice)) {
      return { account, updated: false, reason: 'Stop Loss must remain on the protective side of the current market price', events };
    }

    // Rule 8: Never widen stops
    const existingStop = positivePrice(pos.stopLoss);
    if (direction === 'LONG' && existingStop !== null && roundedSL < existingStop) {
      return { account, updated: false, reason: 'Cannot widen Stop Loss on Long position', events };
    }
    if (direction === 'SHORT' && existingStop !== null && roundedSL > existingStop) {
      return { account, updated: false, reason: 'Cannot widen Stop Loss on Short position', events };
    }

    const oldSL = pos.stopLoss;
    pos.stopLoss = roundedSL;
    const entryPrice = positivePrice(pos.entryPrice);
    if (entryPrice !== null && ((direction === 'LONG' && roundedSL >= entryPrice) || (direction === 'SHORT' && roundedSL <= entryPrice))) {
      pos.breakevenMoved = true;
    }

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
