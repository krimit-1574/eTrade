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

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function asFiniteNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSymbol(symbol) {
  return typeof symbol === 'string'
    ? symbol.trim().toUpperCase().replace(/\.NS$/i, '')
    : '';
}

function normalizeRiskSettings(settings = {}) {
  const merged = { ...DEFAULT_RISK_SETTINGS, ...(settings || {}) };
  const ranges = {
    paperCapital: [0.01, Number.MAX_SAFE_INTEGER],
    maxRiskPerTradePct: [0, 100],
    maxCapitalPerTradePct: [0, 100],
    maxDailyLoss: [0, Number.MAX_SAFE_INTEGER],
    maxSimultaneousPositions: [0, 100],
    maxTotalExposurePct: [0, 100],
    maxTradesPerStock: [0, 10000],
    maxTradesPerDay: [0, 10000],
    maxConsecutiveLosses: [0, 10000],
    cooldownMinutes: [0, 24 * 60],
    minAiConfidence: [0, 100],
    minRiskReward: [0, 1000],
  };

  for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
    const parsed = asFiniteNumber(merged[key]);
    const fallback = DEFAULT_RISK_SETTINGS[key];
    merged[key] = parsed === null || parsed < minimum || parsed > maximum ? fallback : parsed;
  }

  for (const key of ['maxSimultaneousPositions', 'maxTradesPerStock', 'maxTradesPerDay', 'maxConsecutiveLosses']) {
    merged[key] = Math.floor(merged[key]);
  }

  merged.bypassMarketHours = merged.bypassMarketHours === true;
  merged.bypassCutoff = merged.bypassCutoff === true;
  return merged;
}

function parseClockMinutes(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(typeof value === 'string' ? value.trim() : '');
  if (!match) return parseClockMinutes(fallback, '00:00');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return parseClockMinutes(fallback, '00:00');
  return hours * 60 + minutes;
}

function getIstParts(value = null) {
  const date = value === null || value === undefined ? new Date() : new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;

  const ist = new Date(timestamp + IST_OFFSET_MS);
  return {
    timestamp,
    day: ist.getUTCDay(),
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    dateKey: `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`,
  };
}

function isTradeFromDate(record, dateKey) {
  const timestamp = record?.exitTime || record?.entryTime || record?.filledAt || record?.createdAt;
  if (!timestamp) return true; // Preserve legacy/session-only records that predate timestamps.
  return getIstParts(timestamp)?.dateKey === dateKey;
}

export const RiskEngine = {
  /**
   * Loads risk configuration from storage or returns defaults.
   */
  loadSettings() {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (stored) {
        return normalizeRiskSettings(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('RiskEngine: Failed to read from localStorage', e);
    }
    return normalizeRiskSettings();
  },

  /**
   * Persists updated risk settings.
   */
  saveSettings(settings) {
    const merged = normalizeRiskSettings(settings);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
      return merged;
    } catch (e) {
      console.warn('RiskEngine: Failed to save to localStorage', e);
      return merged;
    }
  },

  /**
   * Resets settings back to institutional defaults.
   */
  resetSettings() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    return normalizeRiskSettings();
  },

  /**
   * Determines dynamic Stop-Loss using technical market structure:
   * Combines ATR volatility multiplier and swing highs/lows or support/resistance.
   */
  calculateStructuralStopLoss({ entry, direction, atr, support, resistance, recentCandles = [] }) {
    const safeEntry = asFiniteNumber(entry);
    if (safeEntry === null || safeEntry <= 0 || (direction !== 'LONG' && direction !== 'SHORT')) return null;

    const parsedAtr = asFiniteNumber(atr);
    const safeAtr = parsedAtr !== null && parsedAtr > 0 ? parsedAtr : safeEntry * 0.008;
    const candles = Array.isArray(recentCandles) ? recentCandles : [];
    const safeSupport = asFiniteNumber(support);
    const safeResistance = asFiniteNumber(resistance);

    if (direction === 'LONG') {
      // 1. Base ATR Stop
      let stopLoss = safeEntry - (safeAtr * 1.5);

      // 2. Recent swing low / support anchor
      if (safeSupport !== null && safeSupport > 0 && safeSupport < safeEntry) {
        const supportBuffer = safeSupport * 0.998; // 0.2% below support
        // Choose the tighter structural level that is at least 0.3% away
        if (safeEntry - supportBuffer >= safeEntry * 0.003 && safeEntry - supportBuffer <= safeEntry * 0.03) {
          stopLoss = Math.max(stopLoss, supportBuffer);
        }
      }

      // 3. Lowest low of last 3-5 candles if available
      if (candles.length >= 3) {
        const lows = candles.slice(-5)
          .map(c => asFiniteNumber(c?.low ?? c?.close))
          .filter(value => value !== null && value > 0);
        const lowestLow = lows.length > 0 ? Math.min(...lows) : null;
        if (lowestLow !== null && lowestLow < safeEntry && safeEntry - lowestLow <= safeEntry * 0.03) {
          stopLoss = Math.max(stopLoss, lowestLow * 0.999);
        }
      }

      // Hard cap: maximum 3% stop loss distance, minimum 0.2%
      if (safeEntry - stopLoss > safeEntry * 0.03) stopLoss = safeEntry * 0.97;
      if (safeEntry - stopLoss < safeEntry * 0.002) stopLoss = safeEntry * 0.998;

      return parseFloat(stopLoss.toFixed(2));
    }

    // SHORT
    let stopLoss = safeEntry + (safeAtr * 1.5);

    if (safeResistance !== null && safeResistance > safeEntry) {
      const resistanceBuffer = safeResistance * 1.002;
      if (resistanceBuffer - safeEntry >= safeEntry * 0.003 && resistanceBuffer - safeEntry <= safeEntry * 0.03) {
        stopLoss = Math.min(stopLoss, resistanceBuffer);
      }
    }

    if (candles.length >= 3) {
      const highs = candles.slice(-5)
        .map(c => asFiniteNumber(c?.high ?? c?.close))
        .filter(value => value !== null && value > 0);
      const highestHigh = highs.length > 0 ? Math.max(...highs) : null;
      if (highestHigh !== null && highestHigh > safeEntry && highestHigh - safeEntry <= safeEntry * 0.03) {
        stopLoss = Math.min(stopLoss, highestHigh * 1.001);
      }
    }

    if (stopLoss - safeEntry > safeEntry * 0.03) stopLoss = safeEntry * 1.03;
    if (stopLoss - safeEntry < safeEntry * 0.002) stopLoss = safeEntry * 1.002;

    return parseFloat(stopLoss.toFixed(2));
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
  calculatePositionSize({ accountValue, availableCash, entryPrice, stopLoss, settings, currentExposure = 0 } = {}) {
    const config = normalizeRiskSettings(settings || this.loadSettings());
    const entry = asFiniteNumber(entryPrice);
    const stop = asFiniteNumber(stopLoss);
    const equity = asFiniteNumber(accountValue);
    const available = asFiniteNumber(availableCash);
    const exposureValue = asFiniteNumber(currentExposure);

    if (entry === null || entry <= 0 || stop === null || stop <= 0 || entry === stop) {
      return { quantity: 0, riskAmount: 0, capitalRequired: 0, constrainedBy: 'INVALID_PRICES' };
    }

    // Missing account values must fail closed. A literal zero cash balance must never
    // fall back to the account equity and manufacture buying power.
    const totalEquity = equity !== null && equity > 0
      ? equity
      : (available !== null && available > 0 ? available : 0);
    const cash = available !== null ? Math.max(0, available) : totalEquity;
    const exposure = exposureValue !== null ? Math.max(0, exposureValue) : 0;

    if (totalEquity <= 0 || cash <= 0) {
      return { quantity: 0, riskAmount: 0, actualRisk: 0, capitalRequired: 0, constrainedBy: 'AVAILABLE_CASH', remainingExposure: 0 };
    }

    // 1. Calculate nominal monetary risk allowance
    const riskAmount = totalEquity * (config.maxRiskPerTradePct / 100);

    // 2. Per-share risk distance
    const perShareRisk = Math.abs(entry - stop);
    if (perShareRisk <= 0) {
      return { quantity: 0, riskAmount: 0, capitalRequired: 0, constrainedBy: 'ZERO_PER_SHARE_RISK' };
    }

    // 3. Raw quantity from risk equation
    let rawQty = Math.floor(riskAmount / perShareRisk);

    // 4. Maximum capital allocation constraint
    const maxCapitalAllowed = totalEquity * (config.maxCapitalPerTradePct / 100);
    const maxAffordableByAllocation = Math.floor(maxCapitalAllowed / entry);

    // 5. Total exposure constraint (Rule: maxTotalExposurePct, e.g. 80%)
    const maxTotalExposurePct = config.maxTotalExposurePct;
    const remainingExposure = Math.max(0, (totalEquity * maxTotalExposurePct / 100) - exposure);
    const maxAffordableByExposure = Math.floor(remainingExposure / entry);

    // 6. Hard cash constraint (leaving ₹50 buffer for fees & slippage)
    const maxAffordableByCash = Math.floor(Math.max(0, cash - 50) / (entry * 1.002));

    // 7. Constrain quantity
    let quantity = Math.min(rawQty, maxAffordableByAllocation, maxAffordableByExposure, maxAffordableByCash);
    quantity = Math.max(0, quantity);

    const capitalRequired = parseFloat((quantity * entry).toFixed(2));
    const actualRisk = parseFloat((quantity * perShareRisk).toFixed(2));

    let constrainedBy = 'RISK_FORMULA';
    if (quantity < rawQty) {
      if (maxAffordableByCash <= maxAffordableByAllocation && maxAffordableByCash <= maxAffordableByExposure) {
        constrainedBy = 'AVAILABLE_CASH';
      } else if (maxAffordableByExposure <= maxAffordableByAllocation) {
        constrainedBy = 'MAX_TOTAL_EXPOSURE';
      } else {
        constrainedBy = 'MAX_CAPITAL_ALLOCATION';
      }
    }

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
    return settings?.bypassMarketHours === true || marketState?.bypassMarketHours === true;
  },

  /**
   * Policy: Determines whether the 15:15 intraday square-off cutoff is bypassed.
   * When bypassMarketHours is true, cutoff is automatically bypassed.
   * When bypassCutoff is true, cutoff is explicitly bypassed.
   */
  shouldBypassCutoff(settings = {}, marketState = null) {
    return settings?.bypassCutoff === true ||
      settings?.bypassMarketHours === true ||
      marketState?.bypassMarketHours === true;
  },

  /**
   * Policy: Checks market timing permissions for new trade entry.
   * Returns { allowed: true } or { allowed: false, code, reason }.
   */
  checkMarketTimingForEntry({ settings = {}, marketState = null, currentTime = null }) {
    const bypassHours = this.shouldBypassMarketHours(settings, marketState);
    const bypassCutoff = this.shouldBypassCutoff(settings, marketState);

    const ist = getIstParts(currentTime);
    if (!ist) {
      return { allowed: false, code: REJECTION_CODES.MARKET_CLOSED, reason: 'Unable to validate market time.' };
    }

    const startMinutes = parseClockMinutes(settings.tradingStartTime, '09:15');
    const cutoffMinutes = parseClockMinutes(settings.intradayCutoffTime, '15:15');
    const marketCloseMinutes = 15 * 60 + 30;

    // 1. Weekend check
    if (!bypassHours && (ist.day === 0 || ist.day === 6)) {
      return { allowed: false, code: REJECTION_CODES.MARKET_CLOSED, reason: 'Market is closed on weekends.' };
    }

    // 2. Pre-market start check
    if (!bypassHours && ist.minutes < startMinutes) {
      return { 
        allowed: false, 
        code: REJECTION_CODES.TRADING_NOT_STARTED, 
        reason: `Trading session opens at ${settings.tradingStartTime || '09:15'} IST.` 
      };
    }

    // 3. Regular market close check
    if (!bypassHours && ist.minutes >= marketCloseMinutes) {
      return { 
        allowed: false, 
        code: REJECTION_CODES.MARKET_CLOSED, 
        reason: 'Regular trading session closed at 15:30 IST.' 
      };
    }

    // 4. Intraday cutoff check (new entries blocked past 15:15 unless cutoff is bypassed)
    if (!bypassCutoff && ist.minutes >= cutoffMinutes) {
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

    const ist = getIstParts(currentTime);
    if (!ist) return true;
    const cutoffMinutes = parseClockMinutes(settings?.intradayCutoffTime, '15:15');
    return ist.minutes >= cutoffMinutes;
  },

  /**
   * Comprehensive Pre-Trade Validation Gate.
   * Checks all 12+ institutional risk rules before allowing order execution.
   */
  validateTrade({ account, decision, stockInfo, marketState, customSettings, currentTime } = {}) {
    const settings = normalizeRiskSettings(customSettings || this.loadSettings());

    // 1. Trade direction & decision validity. Direction and action must agree;
    // otherwise a malformed BUY could be executed as a short (or vice versa).
    const expectedDirection = decision?.decision === 'BUY'
      ? 'LONG'
      : (decision?.decision === 'SHORT' ? 'SHORT' : null);
    if (!decision || !expectedDirection || decision.direction !== expectedDirection) {
      return { approved: false, code: 'NOT_ACTIONABLE', reason: 'Decision or trade direction is invalid.' };
    }
    if (!account || typeof account !== 'object') {
      return { approved: false, code: REJECTION_CODES.INSUFFICIENT_CAPITAL, reason: 'Paper account state is unavailable.' };
    }

    const entry = asFiniteNumber(decision.entry);
    const stopLoss = asFiniteNumber(decision.stopLoss);
    const target1 = asFiniteNumber(decision.target1);
    const confidence = asFiniteNumber(decision.confidence);
    const cleanSym = normalizeSymbol(stockInfo?.sym || stockInfo?.symbol);

    if (entry === null || entry <= 0 || !cleanSym) {
      return { approved: false, code: 'NOT_ACTIONABLE', reason: 'Trade entry price or symbol is invalid.' };
    }
    if (stopLoss === null || stopLoss <= 0 ||
        (expectedDirection === 'LONG' && stopLoss >= entry) ||
        (expectedDirection === 'SHORT' && stopLoss <= entry)) {
      return {
        approved: false,
        code: REJECTION_CODES.INVALID_STOP_LOSS,
        reason: `${expectedDirection === 'LONG' ? 'Long' : 'Short'} Stop Loss must be a finite positive price strictly ${expectedDirection === 'LONG' ? 'below' : 'above'} Entry price.`,
      };
    }
    if (confidence === null || confidence < 0 || confidence > 100) {
      return { approved: false, code: REJECTION_CODES.LOW_CONFIDENCE, reason: 'AI confidence must be a finite percentage between 0 and 100.' };
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

    const nowParts = getIstParts(currentTime);
    const referenceTimestamp = nowParts?.timestamp ?? Date.now();

    // 3. Daily Loss Limit Check. Include live losses so a losing open book cannot
    // keep adding risk until those positions happen to close.
    const realizedDaily = asFiniteNumber(account.dailyPnL) ?? 0;
    const unrealizedDaily = asFiniteNumber(account.unrealizedPnL) ?? 0;
    const netDailyPnL = realizedDaily + unrealizedDaily;
    if (netDailyPnL < 0 && netDailyPnL <= -settings.maxDailyLoss) {
      return { 
        approved: false, 
        code: REJECTION_CODES.DAILY_LOSS_LIMIT, 
        reason: `Daily loss limit reached (-₹${Math.abs(settings.maxDailyLoss)}). Trading halted for the day.` 
      };
    }

    // 4. Maximum Simultaneous Positions & Duplicate Symbol Check
    const activeList = (Array.isArray(account.activePositions)
      ? account.activePositions
      : (account.activePosition ? [account.activePosition] : []))
      .filter(position => position && position.status !== 'POSITION_CLOSED');
    const maxPositions = settings.maxSimultaneousPositions;
    if (activeList.length >= maxPositions) {
      return { 
        approved: false, 
        code: REJECTION_CODES.MAX_POSITIONS_REACHED, 
        reason: `Max simultaneous positions (${maxPositions}) already active.` 
      };
    }
    if (activeList.some(p => normalizeSymbol(p.symbol) === cleanSym)) {
      return {
        approved: false,
        code: REJECTION_CODES.MAX_POSITIONS_REACHED,
        reason: `Active position already exists for ${cleanSym}.`
      };
    }

    const closed = Array.isArray(account.closedPositions) ? account.closedPositions : [];
    const dateKey = nowParts?.dateKey;
    const todayClosed = dateKey ? closed.filter(trade => isTradeFromDate(trade, dateKey)) : closed;
    const todayActive = dateKey ? activeList.filter(trade => isTradeFromDate(trade, dateKey)) : activeList;

    // 5. Maximum Daily Trades. Count filled open entries as trades too; counting
    // only closed positions allowed maxTradesPerDay + maxPositions entries.
    if (todayClosed.length + todayActive.length >= settings.maxTradesPerDay) {
      return { 
        approved: false, 
        code: REJECTION_CODES.MAX_DAILY_TRADES, 
        reason: `Daily trade frequency limit (${settings.maxTradesPerDay}) reached.` 
      };
    }

    // 6. Maximum Trades per Stock (Symbol Specific)
    const symbolTrades = todayClosed.filter(p => normalizeSymbol(p.symbol) === cleanSym);
    const activeSymbolTrades = todayActive.filter(p => normalizeSymbol(p.symbol) === cleanSym);
    if (symbolTrades.length + activeSymbolTrades.length >= settings.maxTradesPerStock) {
      return { 
        approved: false, 
        code: REJECTION_CODES.MAX_TRADES_PER_STOCK, 
        reason: `Max trade count for ${cleanSym} (${settings.maxTradesPerStock}) reached today.` 
      };
    }

    // 7. Maximum Consecutive Losses Protection
    if (settings.maxConsecutiveLosses > 0 && todayClosed.length >= settings.maxConsecutiveLosses) {
      const recentTrades = todayClosed.slice(-settings.maxConsecutiveLosses);
      const allLosses = recentTrades.every(t => (asFiniteNumber(t.realizedPnL) ?? 0) < 0);
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
        const diffMinutes = Number.isFinite(exitTimeMs)
          ? Math.max(0, (referenceTimestamp - exitTimeMs) / 60000)
          : Number.POSITIVE_INFINITY;

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
          const setupLabel = typeof decision.setup === 'string' ? decision.setup.replace(/_/g, ' ') : 'the same setup';
          return {
            approved: false,
            code: REJECTION_CODES.REVENGE_TRADING_BLOCKED,
            reason: `Recent stop-out on ${setupLabel}. Requires higher timeframe confirmation.`
          };
        }
      }
    }

    // 9. AI Quality & Confidence Gate
    if (confidence < settings.minAiConfidence) {
      return { 
        approved: false, 
        code: REJECTION_CODES.LOW_CONFIDENCE, 
        reason: `AI confidence (${decision.confidence}%) is below minimum required (${settings.minAiConfidence}%).` 
      };
    }

    // 10. Risk/Reward Ratio Gate
    const targetIsValid = target1 !== null && target1 > 0 &&
      (expectedDirection === 'LONG' ? target1 > entry : target1 < entry);
    const targetDistance = targetIsValid ? Math.abs(target1 - entry) : 0;
    const stopDistance = Math.abs(entry - stopLoss);
    const calculatedRR = stopDistance > 0 ? parseFloat((targetDistance / stopDistance).toFixed(2)) : 0;
    const reportedRR = asFiniteNumber(decision.riskReward);
    // Never trust an AI-reported ratio that is more optimistic than its actual levels.
    const tradeRR = reportedRR !== null && reportedRR >= 0
      ? Math.min(reportedRR, calculatedRR)
      : calculatedRR;

    if (tradeRR < settings.minRiskReward) {
      return { 
        approved: false, 
        code: REJECTION_CODES.POOR_RISK_REWARD, 
        reason: `Risk/Reward (${tradeRR}:1) is below required minimum (${settings.minRiskReward}:1).` 
      };
    }

    // 11. Position Sizing & Capital Feasibility. Recompute exposure from positions
    // and take the larger stored value so stale bookkeeping cannot loosen the cap.
    const positionsExposure = activeList.reduce((sum, position) => {
      const positionEntry = asFiniteNumber(position.entryPrice);
      const positionQuantity = asFiniteNumber(position.quantity);
      return positionEntry !== null && positionEntry > 0 && positionQuantity !== null && positionQuantity > 0
        ? sum + positionEntry * positionQuantity
        : sum;
    }, 0);
    const storedExposure = asFiniteNumber(account.usedCapital);
    const currentExposure = Math.max(positionsExposure, storedExposure !== null ? Math.max(0, storedExposure) : 0);
    const sizeResult = this.calculatePositionSize({
      accountValue: account.accountValue,
      availableCash: account.availableCash,
      entryPrice: entry,
      stopLoss,
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
