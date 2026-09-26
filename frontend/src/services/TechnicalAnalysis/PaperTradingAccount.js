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

const DEFAULT_CONFIG = {
  initialCapital: 100000,  // ₹1,00,000
  slippage: 0.0005,        // 0.05% simulated slippage
  commission: 20,          // ₹20 per order (flat)
  spread: 0.0002,          // 0.02% simulated spread
};

function createFreshAccount(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
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
    pendingOrders: [],
    closedPositions: [],
    orderHistory: [],

    // Session info
    sessionId: `paper_${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
}

export const PaperTradingAccount = {

  /**
   * Loads account from sessionStorage, or creates a fresh one.
   */
  load(config) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!parsed.pendingOrders) parsed.pendingOrders = [];
          if (!parsed.closedPositions) parsed.closedPositions = [];
          if (!parsed.orderHistory) parsed.orderHistory = [];
          // Merge config overrides but keep stored balances
          if (config) parsed.config = { ...DEFAULT_CONFIG, ...config };
          return parsed;
        }
      }
    } catch (e) {
      console.warn('PaperTradingAccount: Failed to load from storage', e);
    }
    return createFreshAccount(config);
  },

  /**
   * Persists the account state to sessionStorage.
   */
  save(account) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(account));
      }
    } catch (e) {
      console.warn('PaperTradingAccount: Failed to save to storage', e);
    }
  },

  /**
   * Resets the account to a fresh state.
   */
  reset(config) {
    const fresh = createFreshAccount(config);
    this.save(fresh);
    return fresh;
  },

  /**
   * Updates unrealized P&L and account value based on current market price.
   */
  updateMarketPrice(account, currentPrice) {
    if (!account.activePosition) {
      account.unrealizedPnL = 0;
      account.accountValue = account.availableCash + account.realizedPnL;
      return account;
    }

    const pos = account.activePosition;
    const qty = pos.quantity;
    const entry = pos.entryPrice;

    if (pos.direction === 'LONG') {
      account.unrealizedPnL = (currentPrice - entry) * qty;
    } else {
      account.unrealizedPnL = (entry - currentPrice) * qty;
    }

    pos.currentPrice = currentPrice;
    pos.unrealizedPnL = account.unrealizedPnL;
    pos.pnlPct = entry > 0 ? ((account.unrealizedPnL / (entry * qty)) * 100) : 0;

    account.accountValue = account.availableCash + account.usedCapital + account.unrealizedPnL;
    return account;
  },

  DEFAULT_CONFIG,
};
