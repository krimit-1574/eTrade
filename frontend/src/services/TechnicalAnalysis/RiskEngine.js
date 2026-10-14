/**
 * RiskEngine.js
 * Professional Risk Management & Automated Position Sizing Engine.
 *
 * ⚠️ AUTHORITY PRINCIPLE:
 * The Risk Engine has absolute authority over the AI Strategy Engine.
 * The AI MUST NEVER bypass the Risk Engine.
 *
 * All trades must be validated and sized by RiskEngine before execution.
 */

const STORAGE_KEY = 'etrade_risk_settings';

export const DEFAULT_RISK_SETTINGS = {
  // Capital & Exposure
  paperCapital: 100000,           // ₹1,00,000 baseline simulated capital
  maxRiskPerTradePct: 1.0,        // 1.0% maximum risk of account value per trade (e.g. ₹1,000)
  maxCapitalPerTradePct: 25.0,    // 25% maximum position capital allocation (e.g. ₹25,000)
  maxDailyLoss: 3000,             // ₹3,000 max daily loss (3% of account) before trading halts
  maxSimultaneousPositions: 4,    // Max 4 concurrent positions for multi-stock AI intraday
  maxTotalExposurePct: 80.0,      // Max 80% total account exposure across all active positions

  // Trade Frequency & Overtrading Protection
  maxTradesPerStock: 3,           // Max 3 trades per symbol per day
  maxTradesPerDay: 10,            // Max 10 total trades across all symbols per day
  maxConsecutiveLosses: 3,        // Max 3 back-to-back losses before halting trading
  cooldownMinutes: 5,             // 5 minutes forced rest after exiting a symbol before re-entry

  // Quality & Discipline Gates
  minAiConfidence: 65,            // 65% minimum AI confidence score required
  minRiskReward: 1.50,            // 1:1.50 minimum Risk/Reward ratio required
  tradingStartTime: '09:15',      // 09:15 IST (Market open)
  intradayCutoffTime: '15:15',    // 15:15 IST (No new entries 15 mins before market close)
};

export const REJECTION_CODES = {
  MARKET_CLOSED: 'MARKET_CLOSED',
  TRADING_NOT_STARTED: 'TRADING_NOT_STARTED',
  CUTOFF_TIME_REACHED: 'CUTOFF_TIME_REACHED',
  DAILY_LOSS_LIMIT: 'DAILY_LOSS_LIMIT',
  MAX_POSITIONS_REACHED: 'MAX_POSITIONS_REACHED',
  MAX_DAILY_TRADES: 'MAX_DAILY_TRADES',
  MAX_TRADES_PER_STOCK: 'MAX_TRADES_PER_STOCK',
  MAX_CONSECUTIVE_LOSSES: 'MAX_CONSECUTIVE_LOSSES',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  REVENGE_TRADING_BLOCKED: 'REVENGE_TRADING_BLOCKED',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  POOR_RISK_REWARD: 'POOR_RISK_REWARD',
  INVALID_STOP_LOSS: 'INVALID_STOP_LOSS',
  INSUFFICIENT_CAPITAL: 'INSUFFICIENT_CAPITAL',
  MAX_TOTAL_EXPOSURE_REACHED: 'MAX_TOTAL_EXPOSURE_REACHED',
  STALE_DATA: 'STALE_DATA',
};

export const RiskEngine = {
  /**
   * Loads risk configuration from storage or returns defaults.
   */
  loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_RISK_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('RiskEngine: Failed to read from localStorage', e);
    }
    return { ...DEFAULT_RISK_SETTINGS };
  },

  /**
   * Persists updated risk settings.
   */
  saveSettings(settings) {
    try {
      const merged = { ...DEFAULT_RISK_SETTINGS, ...settings };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    } catch (e) {
      console.warn('RiskEngine: Failed to save to localStorage', e);
      return { ...DEFAULT_RISK_SETTINGS, ...settings };
    }
  },

  /**
   * Resets settings back to institutional defaults.
   */
  resetSettings() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    return { ...DEFAULT_RISK_SETTINGS };
  },

  /**
   * Determines dynamic Stop-Loss using technical market structure:
   * Combines ATR volatility multiplier and swing highs/lows or support/resistance.
   */
  calculateStructuralStopLoss({ entry, direction, atr, support, resistance, recentCandles = [] }) {
    if (!entry || entry <= 0) return null;
    const safeAtr = atr && atr > 0 ? atr : entry * 0.008; // Fallback 0.8% ATR if unavailable

    if (direction === 'LONG') {
      // 1. Base ATR Stop
      let stopLoss = entry - (safeAtr * 1.5);

      // 2. Recent swing low / support anchor
      if (support && support < entry) {
        const supportBuffer = support * 0.998; // 0.2% below support
        // Choose the tighter structural level that is at least 0.3% away
        if (entry - supportBuffer >= entry * 0.003 && entry - supportBuffer <= entry * 0.03) {
          stopLoss = Math.max(stopLoss, supportBuffer);
        }
      }

      // 3. Lowest low of last 3-5 candles if available
      if (recentCandles.length >= 3) {
        const lowestLow = Math.min(...recentCandles.slice(-5).map(c => parseFloat(c.low || c.close)));
        if (lowestLow < entry && entry - lowestLow <= entry * 0.03) {
          stopLoss = Math.max(stopLoss, lowestLow * 0.999);
        }
      }

      // Hard cap: maximum 3% stop loss distance, minimum 0.2%
      if (entry - stopLoss > entry * 0.03) stopLoss = entry * 0.97;
      if (entry - stopLoss < entry * 0.002) stopLoss = entry * 0.998;

      return parseFloat(stopLoss.toFixed(2));
    } else {
      // SHORT
      let stopLoss = entry + (safeAtr * 1.5);

      if (resistance && resistance > entry) {
        const resistanceBuffer = resistance * 1.002;
        if (resistanceBuffer - entry >= entry * 0.003 && resistanceBuffer - entry <= entry * 0.03) {
          stopLoss = Math.min(stopLoss, resistanceBuffer);
        }
      }

      if (recentCandles.length >= 3) {
        const highestHigh = Math.max(...recentCandles.slice(-5).map(c => parseFloat(c.high || c.close)));
        if (highestHigh > entry && highestHigh - entry <= entry * 0.03) {
          stopLoss = Math.min(stopLoss, highestHigh * 1.001);
        }
      }

      if (stopLoss - entry > entry * 0.03) stopLoss = entry * 1.03;
      if (stopLoss - entry < entry * 0.002) stopLoss = entry * 1.002;

      return parseFloat(stopLoss.toFixed(2));
    }
  },

  /**
   * Risk-Based Position Sizing Formula:
   *
   * Risk Amount = Account Balance × Risk Percentage
   * Quantity = Risk Amount / |Entry - Stop Loss|
   *
   * Then constrained by:
   * - Available capital
   * - Maximum capital per trade allocation
   * - Commission buffer
   */
  calculatePositionSize({ accountValue, availableCash, entryPrice, stopLoss, settings }) {
    const config = settings || this.loadSettings();
    if (!entryPrice || entryPrice <= 0 || !stopLoss || entryPrice === stopLoss) {
      return { quantity: 0, riskAmount: 0, capitalRequired: 0, constrainedBy: 'INVALID_PRICES' };
    }

    const totalEquity = accountValue && accountValue > 0 ? accountValue : (availableCash || 100000);
    const cash = availableCash && availableCash > 0 ? availableCash : totalEquity;

    // 1. Calculate nominal monetary risk allowance
    const riskAmount = totalEquity * (config.maxRiskPerTradePct / 100);

    // 2. Per-share risk distance
    const perShareRisk = Math.abs(entryPrice - stopLoss);
    if (perShareRisk <= 0) {
      return { quantity: 0, riskAmount: 0, capitalRequired: 0, constrainedBy: 'ZERO_PER_SHARE_RISK' };
    }

    // 3. Raw quantity from risk equation
    let rawQty = Math.floor(riskAmount / perShareRisk);

    // 4. Maximum capital allocation constraint
    const maxCapitalAllowed = totalEquity * (config.maxCapitalPerTradePct / 100);
    const maxAffordableByAllocation = Math.floor(maxCapitalAllowed / entryPrice);

    // 5. Total exposure constraint (Rule: maxTotalExposurePct, e.g. 80%)
    const maxTotalExposurePct = config.maxTotalExposurePct !== undefined ? config.maxTotalExposurePct : 80;
    const remainingExposure = Math.max(0, (totalEquity * maxTotalExposurePct / 100) - currentExposure);
    const maxAffordableByExposure = Math.floor(remainingExposure / entryPrice);

    // 6. Hard cash constraint (leaving ₹50 buffer for fees & slippage)
    const maxAffordableByCash = Math.floor(Math.max(0, cash - 50) / (entryPrice * 1.002));

    // 7. Constrain quantity
    let quantity = Math.min(rawQty, maxAffordableByAllocation, maxAffordableByExposure, maxAffordableByCash);
    quantity = Math.max(0, quantity);

    const capitalRequired = parseFloat((quantity * entryPrice).toFixed(2));
    const actualRisk = parseFloat((quantity * perShareRisk).toFixed(2));

    let constrainedBy = 'RISK_FORMULA';
    if (quantity === maxAffordableByAllocation && quantity < rawQty) constrainedBy = 'MAX_CAPITAL_ALLOCATION';
    if (quantity === maxAffordableByExposure && quantity < rawQty && quantity < maxAffordableByAllocation) constrainedBy = 'MAX_TOTAL_EXPOSURE';
    if (quantity === maxAffordableByCash && quantity < rawQty && quantity < maxAffordableByExposure && quantity < maxAffordableByAllocation) constrainedBy = 'AVAILABLE_CASH';

    return {
      quantity,
      riskAmount: parseFloat(riskAmount.toFixed(2)),
      actualRisk,
      perShareRisk: parseFloat(perShareRisk.toFixed(2)),
      capitalRequired,
      constrainedBy,
      remainingExposure: parseFloat(remainingExposure.toFixed(2)),
    };
  },

  /**
   * Policy: Determines whether general market operating hours (09:15-15:30) and weekend checks are bypassed.
   */
  shouldBypassMarketHours(settings = {}, marketState = null) {
    return Boolean(settings?.bypassMarketHours || marketState?.bypassMarketHours);
  },

  /**
   * Policy: Determines whether the 15:15 intraday square-off cutoff is bypassed.
   * When bypassMarketHours is true, cutoff is automatically bypassed.
   * When bypassCutoff is true, cutoff is explicitly bypassed.
   */
  shouldBypassCutoff(settings = {}, marketState = null) {
    return Boolean(
      settings?.bypassCutoff ||
      settings?.bypassMarketHours ||
      marketState?.bypassMarketHours
    );
  },

  /**
   * Policy: Checks market timing permissions for new trade entry.
   * Returns { allowed: true } or { allowed: false, code, reason }.
   */
  checkMarketTimingForEntry({ settings = {}, marketState = null, currentTime = null }) {
    const bypassHours = this.shouldBypassMarketHours(settings, marketState);
    const bypassCutoff = this.shouldBypassCutoff(settings, marketState);

    const now = currentTime ? new Date(currentTime) : new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    const day = ist.getDay(); // 0 = Sun, 6 = Sat
    const currentTimeNum = ist.getHours() * 100 + ist.getMinutes();

    const [startH, startM] = (settings.tradingStartTime || '09:15').split(':').map(Number);
    const [cutoffH, cutoffM] = (settings.intradayCutoffTime || '15:15').split(':').map(Number);
    const startTimeNum = startH * 100 + startM;
    const cutoffTimeNum = cutoffH * 100 + cutoffM;
    const marketCloseTimeNum = 1530; // 15:30 IST regular close

    // 1. Weekend check
    if (!bypassHours && (day === 0 || day === 6)) {
      return { allowed: false, code: REJECTION_CODES.MARKET_CLOSED, reason: 'Market is closed on weekends.' };
    }

    // 2. Pre-market start check
    if (!bypassHours && currentTimeNum < startTimeNum) {
      return { 
        allowed: false, 
        code: REJECTION_CODES.TRADING_NOT_STARTED, 
        reason: `Trading session opens at ${settings.tradingStartTime || '09:15'} IST.` 
      };
    }

    // 3. Regular market close check
    if (!bypassHours && currentTimeNum >= marketCloseTimeNum) {
      return { 
        allowed: false, 
        code: REJECTION_CODES.MARKET_CLOSED, 
        reason: 'Regular trading session closed at 15:30 IST.' 
      };
    }

    // 4. Intraday cutoff check (new entries blocked past 15:15 unless cutoff is bypassed)
    if (!bypassCutoff && currentTimeNum >= cutoffTimeNum) {
      return { 
        allowed: false, 
        code: REJECTION_CODES.CUTOFF_TIME_REACHED, 
        reason: `Intraday cutoff reached (${settings.intradayCutoffTime || '15:15'} IST). No new positions permitted.` 
      };
    }

    return { allowed: true };
  },

  /**
   * Policy: Determines whether intraday cutoff square-off exit should be enforced.
   * Returns true if square-off should be triggered, false if bypassed or before cutoff.
   */
  shouldEnforceCutoffExit({ settings = {}, marketState = null, currentTime = null }) {
    if (this.shouldBypassCutoff(settings, marketState)) {
      return false;
    }

    const now = currentTime ? new Date(currentTime) : new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    const [cutoffH, cutoffM] = (settings?.intradayCutoffTime || '15:15').split(':').map(Number);
    const currentNum = ist.getHours() * 100 + ist.getMinutes();
    const cutoffNum = cutoffH * 100 + cutoffM;

    return currentNum >= cutoffNum;
  },

  /**
   * Comprehensive Pre-Trade Validation Gate.
   * Checks all 12+ institutional risk rules before allowing order execution.
   */
  validateTrade({ account, decision, stockInfo, marketState, customSettings, currentTime }) {
    const settings = customSettings || this.loadSettings();

    // 1. Trade direction & decision validity
    if (!decision || (decision.decision !== 'BUY' && decision.decision !== 'SHORT')) {
      return { approved: false, code: 'NOT_ACTIONABLE', reason: 'Decision is WAIT or invalid' };
    }

    // 2. Market State: Hours & Cutoff Time (IST: UTC + 5:30)
    const timingCheck = this.checkMarketTimingForEntry({
      settings,
      marketState,
      currentTime,
    });
    if (!timingCheck.allowed) {
      return { approved: false, code: timingCheck.code, reason: timingCheck.reason };
    }

    // 3. Daily Loss Limit Check
    if (account.dailyPnL <= -Math.abs(settings.maxDailyLoss)) {
      return { 
        approved: false, 
        code: REJECTION_CODES.DAILY_LOSS_LIMIT, 
        reason: `Daily loss limit reached (-₹${Math.abs(settings.maxDailyLoss)}). Trading halted for the day.` 
      };
    }

    // 4. Maximum Simultaneous Positions & Duplicate Symbol Check
    const activeList = account.activePositions || (account.activePosition ? [account.activePosition] : []);
    const maxPositions = settings.maxSimultaneousPositions ?? 4;
    if (activeList.length >= maxPositions) {
      return { 
        approved: false, 
        code: REJECTION_CODES.MAX_POSITIONS_REACHED, 
        reason: `Max simultaneous positions (${maxPositions}) already active.` 
      };
    }
    const cleanSym = (stockInfo?.sym || '').toUpperCase().replace('.NS', '');
    if (activeList.some(p => (p.symbol || '').toUpperCase().replace('.NS', '') === cleanSym)) {
      return {
        approved: false,
        code: REJECTION_CODES.MAX_POSITIONS_REACHED,
        reason: `Active position already exists for ${cleanSym}.`
      };
    }

    // 5. Maximum Daily Trades
    const todayClosedCount = (account.closedPositions || []).length;
    if (todayClosedCount >= settings.maxTradesPerDay) {
      return { 
        approved: false, 
        code: REJECTION_CODES.MAX_DAILY_TRADES, 
        reason: `Daily trade frequency limit (${settings.maxTradesPerDay}) reached.` 
      };
    }

    // 6. Maximum Trades per Stock (Symbol Specific)
    const symbolTrades = (account.closedPositions || []).filter(p => p.symbol === cleanSym);
    if (symbolTrades.length >= settings.maxTradesPerStock) {
      return { 
        approved: false, 
        code: REJECTION_CODES.MAX_TRADES_PER_STOCK, 
        reason: `Max trade count for ${cleanSym} (${settings.maxTradesPerStock}) reached today.` 
      };
    }

    // 7. Maximum Consecutive Losses Protection
    const closed = account.closedPositions || [];
    if (closed.length >= settings.maxConsecutiveLosses) {
      const recentTrades = closed.slice(-settings.maxConsecutiveLosses);
      const allLosses = recentTrades.every(t => (t.realizedPnL || 0) < 0);
      if (allLosses) {
        return { 
          approved: false, 
          code: REJECTION_CODES.MAX_CONSECUTIVE_LOSSES, 
          reason: `Halted after ${settings.maxConsecutiveLosses} consecutive losses to prevent emotional drawdown.` 
        };
      }
    }

    // 8. Cooldown & Anti-Revenge Trading Guard
    if (symbolTrades.length > 0) {
      const lastTrade = symbolTrades[symbolTrades.length - 1];
      if (lastTrade.exitTime) {
        const exitTimeMs = new Date(lastTrade.exitTime).getTime();
        const diffMinutes = (Date.now() - exitTimeMs) / 60000;

        if (diffMinutes < settings.cooldownMinutes) {
          const remainingSec = Math.ceil((settings.cooldownMinutes - diffMinutes) * 60);
          return { 
            approved: false, 
            code: REJECTION_CODES.COOLDOWN_ACTIVE, 
            reason: `Post-trade cooldown active for ${cleanSym} (${remainingSec}s remaining).` 
          };
        }

        // Revenge trading guard: stopped out on same setup
        if (lastTrade.exitReason === 'Stop Loss Hit' && lastTrade.setup === decision.setup && diffMinutes < 15) {
          return {
            approved: false,
            code: REJECTION_CODES.REVENGE_TRADING_BLOCKED,
            reason: `Recent stop-out on ${decision.setup.replace(/_/g, ' ')}. Requires higher timeframe confirmation.`
          };
        }
      }
    }

    // 9. AI Quality & Confidence Gate
    if (decision.confidence < settings.minAiConfidence) {
      return { 
        approved: false, 
        code: REJECTION_CODES.LOW_CONFIDENCE, 
        reason: `AI confidence (${decision.confidence}%) is below minimum required (${settings.minAiConfidence}%).` 
      };
    }

    // 10. Risk/Reward Ratio Gate
    const targetDistance = Math.abs((decision.target1 || 0) - decision.entry);
    const stopDistance = Math.abs(decision.entry - (decision.stopLoss || 0));
    const calculatedRR = stopDistance > 0 ? parseFloat((targetDistance / stopDistance).toFixed(2)) : 0;
    const tradeRR = decision.riskReward || calculatedRR;

    if (tradeRR < settings.minRiskReward) {
      return { 
        approved: false, 
        code: REJECTION_CODES.POOR_RISK_REWARD, 
        reason: `Risk/Reward (${tradeRR}:1) is below required minimum (${settings.minRiskReward}:1).` 
      };
    }

    // 11. Stop-Loss Structural Sanity
    if (!decision.stopLoss || decision.stopLoss <= 0) {
      return { approved: false, code: REJECTION_CODES.INVALID_STOP_LOSS, reason: 'Stop loss is missing or zero.' };
    }
    if (decision.direction === 'LONG' && decision.stopLoss >= decision.entry) {
      return { approved: false, code: REJECTION_CODES.INVALID_STOP_LOSS, reason: 'Long Stop Loss must be strictly below Entry price.' };
    }
    if (decision.direction === 'SHORT' && decision.stopLoss <= decision.entry) {
      return { approved: false, code: REJECTION_CODES.INVALID_STOP_LOSS, reason: 'Short Stop Loss must be strictly above Entry price.' };
    }

    // 12. Position Sizing & Capital Feasibility
    const currentExposure = account.usedCapital !== undefined
      ? account.usedCapital
      : (account.activePositions || []).reduce((sum, p) => sum + (p.entryPrice * p.quantity), 0);
    const sizeResult = this.calculatePositionSize({
      accountValue: account.accountValue,
      availableCash: account.availableCash,
      entryPrice: decision.entry,
      stopLoss: decision.stopLoss,
      settings,
      currentExposure,
    });

    if (sizeResult.quantity < 1) {
      const isExposureConstraint = sizeResult.constrainedBy === 'MAX_TOTAL_EXPOSURE';
      return { 
        approved: false, 
        code: isExposureConstraint ? REJECTION_CODES.MAX_TOTAL_EXPOSURE_REACHED : REJECTION_CODES.INSUFFICIENT_CAPITAL, 
        reason: isExposureConstraint
          ? `Trade exceeds maximum total exposure allowance (${settings.maxTotalExposurePct || 80}%).`
          : `Calculated position size is 0 shares. Insufficient cash or risk allowance.` 
      };
    }

    // All 12 gates cleared: APPROVED
    return {
      approved: true,
      code: 'APPROVED',
      quantity: sizeResult.quantity,
      riskAmount: sizeResult.riskAmount,
      actualRisk: sizeResult.actualRisk,
      capitalRequired: sizeResult.capitalRequired,
      riskReward: tradeRR,
      constrainedBy: sizeResult.constrainedBy,
      settings,
    };
  },
};
