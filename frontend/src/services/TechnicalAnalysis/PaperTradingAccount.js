/**
 * PaperTradingAccount.js
 * Manages simulated paper trading capital and P&L.
 * 
 * PAPER TRADING ONLY — NOT connected to any real broker.
 * 
 * Persists state to sessionStorage so a page refresh
 * within the same browser session does not silently wipe
 * an active paper position.
 */

const STORAGE_KEY = 'etrade_paper_account';
const USER_STORAGE_KEY = 'eTA_user';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DEFAULT_CONFIG = {
  initialCapital: 100000,  // ₹1,00,000
  slippage: 0.0005,        // 0.05% simulated slippage
  commission: 20,          // ₹20 per order (flat)
  spread: 0.0002,          // 0.02% simulated spread
};

function finiteNumber(value, fallback) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConfig(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...(config || {}) };
  merged.initialCapital = Math.max(0, finiteNumber(merged.initialCapital, DEFAULT_CONFIG.initialCapital));
  merged.slippage = Math.max(0, finiteNumber(merged.slippage, DEFAULT_CONFIG.slippage));
  merged.commission = Math.max(0, finiteNumber(merged.commission, DEFAULT_CONFIG.commission));
  merged.spread = Math.max(0, finiteNumber(merged.spread, DEFAULT_CONFIG.spread));
  return merged;
}

function currentTradingDate() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

function rolloverDailyState(account) {
  const today = currentTradingDate();
  if (account.tradingDate !== today) {
    account.dailyPnL = 0;
    account.tradingDate = today;
  }
  return account;
}

function currentOwnerId() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      if (raw) {
        const user = JSON.parse(raw);
        const identifier = user?.user_id ?? user?.id ?? user?.username;
        if (identifier !== undefined && identifier !== null && String(identifier).trim()) {
          return String(identifier).trim();
        }
      }
    }
  } catch {
    // Invalid persisted user data falls back to the guest account.
  }
  return 'guest';
}

function storageKeyFor(ownerId) {
  return `${STORAGE_KEY}:${encodeURIComponent(ownerId)}`;
}

function normalizePositionCollections(account) {
  if (!Array.isArray(account.activePositions)) account.activePositions = [];
  if (account.activePositions.length === 0 && account.activePosition && account.activePosition.status !== 'POSITION_CLOSED') {
    account.activePositions.push(account.activePosition);
  }
  account.activePosition = account.activePositions[0] ?? null;
  if (!Array.isArray(account.pendingOrders)) account.pendingOrders = [];
  if (!Array.isArray(account.closedPositions)) account.closedPositions = [];
  if (!Array.isArray(account.orderHistory)) account.orderHistory = [];
  return account;
}

function recalculateAccount(account) {
  normalizePositionCollections(account);
  account.usedCapital = account.activePositions.reduce((sum, position) => {
    const entry = finiteNumber(position?.entryPrice, 0);
    const quantity = finiteNumber(position?.quantity, 0);
    return sum + Math.max(0, entry) * Math.max(0, quantity);
  }, 0);
  account.unrealizedPnL = account.activePositions.reduce(
    (sum, position) => sum + finiteNumber(position?.unrealizedPnL, 0),
    0
  );
  account.availableCash = finiteNumber(account.availableCash, 0);
  account.accountValue = account.availableCash + account.usedCapital + account.unrealizedPnL;
  return account;
}

function hydrateAccount(parsed, config, ownerId) {
  const account = parsed && typeof parsed === 'object' ? parsed : {};
  account.config = normalizeConfig(config ? { ...(account.config || {}), ...config } : account.config);
  account.ownerId = ownerId;
  account.initialCapital = Math.max(0, finiteNumber(account.initialCapital, account.config.initialCapital));
  account.availableCash = finiteNumber(account.availableCash, account.initialCapital);
  account.realizedPnL = finiteNumber(account.realizedPnL, 0);
  account.unrealizedPnL = finiteNumber(account.unrealizedPnL, 0);
  account.dailyPnL = finiteNumber(account.dailyPnL, 0);
  account.tradingDate = account.tradingDate || currentTradingDate();
  rolloverDailyState(account);
  return recalculateAccount(account);
}

function createFreshAccount(config = {}, ownerId = currentOwnerId()) {
  const merged = normalizeConfig(config);
  return {
    // Configuration
    config: merged,
    initialCapital: merged.initialCapital,

    // Balances
    availableCash: merged.initialCapital,
    usedCapital: 0,
    accountValue: merged.initialCapital,

    // P&L
    realizedPnL: 0,
    unrealizedPnL: 0,
    dailyPnL: 0,

    // Position tracking
    activePosition: null,
    activePositions: [],
    pendingOrders: [],
    closedPositions: [],
    orderHistory: [],

    // Session info
    ownerId,
    tradingDate: currentTradingDate(),
    sessionId: `paper_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
}

export const PaperTradingAccount = {

  /**
   * Loads account from sessionStorage, or creates a fresh one.
   */
  load(config) {
    const ownerId = currentOwnerId();
    const storageKey = storageKeyFor(ownerId);
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Never expose another user's paper positions, even if storage was
          // manually copied or a stale singleton attempts to reuse the account.
          if (parsed?.ownerId && parsed.ownerId !== ownerId) return createFreshAccount(config, ownerId);
          return hydrateAccount(parsed, config, ownerId);
        }
      }
    } catch (e) {
      console.warn('PaperTradingAccount: Failed to load from storage', e);
    }
    return createFreshAccount(config, ownerId);
  },

  /**
   * Persists the account state to sessionStorage.
   */
  save(account) {
    try {
      if (!account || typeof account !== 'object') return false;
      const ownerId = currentOwnerId();
      if (account.ownerId && account.ownerId !== ownerId) {
        console.warn('PaperTradingAccount: Refused to persist an account owned by another user');
        return false;
      }
      account.ownerId = ownerId;
      account.tradingDate = account.tradingDate || currentTradingDate();
      rolloverDailyState(account);
      recalculateAccount(account);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(storageKeyFor(ownerId), JSON.stringify(account));
      }
      return true;
    } catch (e) {
      console.warn('PaperTradingAccount: Failed to save to storage', e);
      return false;
    }
  },

  /**
   * Resets the account to a fresh state.
   */
  reset(config) {
    const fresh = createFreshAccount(config, currentOwnerId());
    this.save(fresh);
    return fresh;
  },

  /**
   * Updates unrealized P&L and account value based on current market price.
   * Supports both updateMarketPrice(account, price) and updateMarketPrice(account, symbol, price).
   */
  updateMarketPrice(account, symbolOrPrice, priceIfSymbol) {
    if (!account || typeof account !== 'object') return account;
    normalizePositionCollections(account);

    let position = null;
    let currentPrice = null;
    if (typeof symbolOrPrice === 'number') {
      // The legacy two-argument form is only unambiguous for a single-stock
      // account. Refuse to mark an arbitrary first position in a multi-stock
      // book; callers must provide the symbol explicitly.
      if (account.activePositions.length > 1) return account;
      position = account.activePositions[0] || null;
      currentPrice = finiteNumber(symbolOrPrice, null);
    } else if (typeof symbolOrPrice === 'string') {
      const cleanSym = symbolOrPrice.trim().toUpperCase().replace(/\.NS$/i, '');
      position = account.activePositions.find(
        candidate => String(candidate?.symbol || '').trim().toUpperCase().replace(/\.NS$/i, '') === cleanSym
      ) || null;
      currentPrice = finiteNumber(priceIfSymbol, null);
    }

    if (position && currentPrice !== null && currentPrice > 0) {
      const entryPrice = finiteNumber(position.entryPrice, 0);
      const quantity = finiteNumber(position.quantity, 0);
      if (entryPrice > 0 && quantity > 0 && (position.direction === 'LONG' || position.direction === 'SHORT')) {
        position.unrealizedPnL = position.direction === 'LONG'
          ? (currentPrice - entryPrice) * quantity
          : (entryPrice - currentPrice) * quantity;
        position.currentPrice = currentPrice;
        position.pnlPct = (position.unrealizedPnL / (entryPrice * quantity)) * 100;
      }
    }

    recalculateAccount(account);
    this.save(account);
    return account;
  },

  /**
   * Rolls daily controls at the IST trading-date boundary before any risk
   * validation or accounting mutation occurs.
   */
  rolloverDaily(account) {
    if (!account || typeof account !== 'object') return account;
    account.tradingDate = account.tradingDate || currentTradingDate();
    return rolloverDailyState(account);
  },

  DEFAULT_CONFIG,
};
