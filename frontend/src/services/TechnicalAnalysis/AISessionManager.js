/**
 * AISessionManager.js
 * Background Singleton — Multi-Stock AI Intraday Session Manager.
 *
 * Architecture:
 *   AISessionManager (singleton)
 *     ├── Session "RELIANCE"  → owns: polling, candles, analysis, decisions, position lifecycle
 *     ├── Session "HDFCBANK"  → owns: polling, candles, analysis, decisions, position lifecycle
 *     └── Session "INFY"     → owns: polling, candles, analysis, decisions, position lifecycle
 *         ↘ All sessions share ONE PaperTradingAccount (global risk + capital)
 *
 * ⚠️ PAPER TRADING ONLY — No real broker connections.
 *
 * Key Design:
 * - Sessions survive UI component unmounting (background execution).
 * - UI subscribes to session state via listeners — it observes, never owns the engine.
 * - Risk Engine validation is atomic per-order (mutex-style guard prevents race conditions).
 * - Each session has an independent polling interval for candles + price ticks.
 */

import { api } from '../../api';
import { SetupAnalyzer } from './SetupAnalyzer';
import { AITradingDecisionEngine } from './AITradingDecisionEngine';
import { RiskEngine } from './RiskEngine';
import { PaperBroker } from './PaperBroker';
import { PaperTradingAccount } from './PaperTradingAccount';
import { PositionManager, POSITION_DECISION } from './PositionManager';
import { SessionJournalService } from './SessionJournalService';
import { MarketContextService } from './MarketContextService';

// ─── Session Status Constants ────────────────────────────────────
export const SESSION_STATUS = {
  INITIALIZING: 'INITIALIZING',
  MONITORING: 'MONITORING',
  WAITING: 'WAITING',
  WAITING_CONFIRMATION: 'WAITING FOR CONFIRMATION',
  RUNNING: 'RUNNING',
  POSITION_ACTIVE: 'POSITION ACTIVE',
  DATA_DISCONNECTED: 'DATA DISCONNECTED',
  RISK_LIMIT: 'RISK LIMIT REACHED',
  STOPPED: 'STOPPED',
  ERROR: 'ERROR',
};

// ─── Timeframe Configuration ────────────────────────────────────
const TIMEFRAME_CONFIG = {
  '1m': { period: '1d', interval: '1m' },
  '3m': { period: '1d', interval: '3m' },
  '5m': { period: '5d', interval: '5m' },
  '15m': { period: '5d', interval: '15m' },
  '30m': { period: '1mo', interval: '30m' },
};

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/\.NS$/, '');
}

function normalizeUserId(userId) {
  return userId === undefined || userId === null || userId === '' ? 'guest' : String(userId);
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// ─── Individual Session State ────────────────────────────────────
function createSessionState(symbol, config = {}) {
  const cleanSymbol = normalizeSymbol(symbol);
  const formattedSymbol = cleanSymbol.includes('.') ? cleanSymbol : `${cleanSymbol}.NS`;

  return {
    // Identity
    id: `session_${cleanSymbol}_${Date.now()}`,
    symbol: cleanSymbol,
    formattedSymbol,
    timeframe: config.timeframe || '5m',
    userId: normalizeUserId(config.userId),
    startingCapital: toFiniteNumber(config.startingCapital, 100000),

    // Status
    status: SESSION_STATUS.INITIALIZING,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    isActive: true,

    // Market Data
    price: 0,
    change: 0,
    changePct: 0,
    chartData: [],
    // A session is safe to trade only after both quote and candle feeds succeed.
    isStaleData: true,
    lastTickTime: null,

    // Analysis
    technicalAnalysis: null,
    tradeDecision: null,
    marketContext: null,

    // Position (symbol-local reference; actual position lives on shared account)
    hasPosition: false,
    positionSummary: null,  // { direction, entry, stopLoss, target1, target2, qty, unrealizedPnL, pnlPct }

    // Trade Levels (for chart overlay)
    tradeLevels: null,

    // Chart Markers (BUY/SHORT/TP/SL/PARTIAL markers)
    markers: [],

    // Timeline Events
    timeline: [{
      id: Date.now(),
      time: new Date().toLocaleTimeString('en-US', { hour12: true }),
      title: 'AI session opened',
      detail: `Initialized AI intraday session for ${cleanSymbol}.`,
      type: 'info',
    }],

    // Journaling
    decisions: [],
    hasExecuted: false,

    // Internal polling refs (not serialized)
    _priceInterval: null,
    _candleInterval: null,
    _priceRequestId: 0,
    _candleRequestId: 0,
    _priceStale: true,
    _candleStale: true,
    _stopPromise: null,
    _journal: null,
  };
}

// ─── Singleton Manager ────────────────────────────────────────────
export class AISessionManagerSingleton {
  constructor() {
    /** @type {Map<string, object>} symbol → session state */
    this.sessions = new Map();

    /** @type {Set<Function>} global state change listeners */
    this.listeners = new Set();

    /** Shared paper trading account across all sessions */
    this.account = null;

    /** Risk settings (shared) */
    this.riskSettings = null;

    /** Market context (shared, refreshed periodically) */
    this.marketContext = null;

    /** Concurrency guard for order execution */
    this._orderLock = false;

    this._eventSequence = 0;

    /** Market context refresh interval */
    this._contextInterval = null;

    this._initialized = false;

    /** Owner for newly-created sessions. Captured on each session for isolation. */
    this.userId = 'guest';
  }

  // ─── Initialization ──────────────────────────────────────────
  initialize(account, riskSettings, userId) {
    const nextUserId = userId === undefined || userId === null
      ? this.userId
      : normalizeUserId(userId);

    // A login boundary must never expose a previous user's in-memory sessions.
    // The logout path should call shutdown() so positions are liquidated first;
    // this synchronous quarantine is defense-in-depth if that cleanup is skipped.
    if (this._initialized && nextUserId !== this.userId) {
      this._clearRuntimeSessions();
      this.account = null;
      this.marketContext = null;
    }

    this.userId = nextUserId;
    this.account = this.account || account || PaperTradingAccount.load();
    this.riskSettings = riskSettings || RiskEngine.loadSettings();

    if (this.account) {
      if (!this.account.config) this.account.config = {};
      this.account.config.maxSimultaneousPositions = this.riskSettings?.maxSimultaneousPositions || 4;
    }

    if (!this._initialized) {
      this._initialized = true;
      // Refresh market context every 60 seconds
      this._refreshMarketContext();
      this._contextInterval = setInterval(() => this._refreshMarketContext(), 60000);
    }

    this._notifyListeners();
  }

  async _refreshMarketContext() {
    try {
      const context = await MarketContextService.fetchMarketIndices();
      if (!this._initialized) return;
      this.marketContext = context;
      this._notifyListeners();
    } catch (err) {
      console.warn('AISessionManager: market context refresh failed:', err);
    }
  }

  // ─── Account Management ──────────────────────────────────────
  getAccount() {
    return this.account;
  }

  updateAccount(account) {
    if (!account) return;
    this.account = account;
    for (const symbol of this.sessions.keys()) {
      this._syncPositionSummary(symbol);
    }
    this._notifyListeners();
  }

  updateRiskSettings(settings) {
    this.riskSettings = settings || RiskEngine.loadSettings();
    if (this.account) {
      if (!this.account.config) this.account.config = {};
      const maxPositions = Number(this.riskSettings?.maxSimultaneousPositions);
      if (Number.isFinite(maxPositions) && maxPositions > 0) {
        this.account.config.maxSimultaneousPositions = maxPositions;
      }
      this._saveAccount();
    }
    // A settings change may make a previously rejected signal eligible again.
    for (const session of this.getActiveSessions()) {
      if (session.status === SESSION_STATUS.RISK_LIMIT) session.hasExecuted = false;
    }
    this._notifyListeners();
  }

  // ─── Session Lifecycle ───────────────────────────────────────
  /**
   * Starts a new AI intraday session for the given symbol.
   * If a session already exists for this symbol, returns the existing one.
   * @returns {object} session state
   */
  startSession(symbol, config = {}) {
    const cleanSymbol = normalizeSymbol(symbol);
    if (!cleanSymbol) {
      console.warn('AISessionManager: Cannot start a session without a symbol');
      return null;
    }

    if (this.sessions.has(cleanSymbol)) {
      const existing = this.sessions.get(cleanSymbol);
      if (existing.isActive) {
        console.warn(`AISessionManager: Session already active for ${cleanSymbol}`);
        return existing;
      }
      // Previous session was stopped — remove and start fresh
      this.sessions.delete(cleanSymbol);
    }

    // Monitoring sessions and funded positions are separate limits. The Risk
    // Engine remains authoritative for maxSimultaneousPositions at execution.
    const configuredMax = Number(this.riskSettings?.maxSimultaneousSessions);
    const maxSessions = Number.isFinite(configuredMax) && configuredMax > 0
      ? Math.floor(configuredMax)
      : 10;
    const activeSessions = this.getActiveSessions();
    if (activeSessions.length >= maxSessions) {
      console.warn(`AISessionManager: Max simultaneous sessions (${maxSessions}) reached`);
      return null;
    }

    const session = createSessionState(cleanSymbol, {
      ...config,
      userId: this.userId,
      startingCapital: this.account?.accountValue ?? this.account?.initialCapital,
      timeframe: TIMEFRAME_CONFIG[config.timeframe] ? config.timeframe : '5m',
    });

    // Resume ownership of a persisted open position after a page refresh so
    // the eventual journal includes the original trade rather than orphaning it.
    const existingPosition = this._getPositionForSymbol(cleanSymbol);
    if (existingPosition?.sessionId) {
      session.id = existingPosition.sessionId;
      session.startedAt = existingPosition.entryTime || session.startedAt;
    }
    this.sessions.set(cleanSymbol, session);
    this._syncPositionSummary(cleanSymbol);
    if (session.hasPosition) session.status = SESSION_STATUS.POSITION_ACTIVE;

    // Start background loops
    this._startSessionPolling(cleanSymbol);

    this._notifyListeners();
    return session;
  }

  /**
   * Stops an AI session, liquidates any open position for this symbol,
   * builds and persists the session journal.
   */
  async stopSession(symbol) {
    const cleanSymbol = normalizeSymbol(symbol);
    const session = this.sessions.get(cleanSymbol);
    if (!session) return null;
    if (session._stopPromise) return session._stopPromise;
    if (!session.isActive) return session._journal;

    session._stopPromise = this._stopSession(session);
    try {
      return await session._stopPromise;
    } finally {
      session._stopPromise = null;
    }
  }

  async _stopSession(session) {
    const { symbol } = session;
    session.isActive = false;
    session.status = SESSION_STATUS.STOPPED;
    session.stoppedAt = new Date().toISOString();
    session._priceRequestId += 1;
    session._candleRequestId += 1;
    this._stopSessionPolling(symbol);

    await this._executeWithLock(async () => {
      const position = this._getPositionForSymbol(symbol);
      if (!position) return;

      // A stop must not orphan an open position merely because the latest
      // quote request failed. Use the most recent known mark as a fallback.
      const exitPrice = [session.price, position.currentPrice, position.entryPrice]
        .map(Number)
        .find(price => Number.isFinite(price) && price > 0);
      if (!exitPrice) {
        session.timeline.push(this._timelineEvent(
          'Position could not be liquidated',
          'No valid market or position price is available. The position remains open.',
          'error'
        ));
        return;
      }

      const result = PaperBroker.closePosition(
        this.account,
        exitPrice,
        'AI session manually stopped by user.',
        null,
        symbol
      );
      this.account = result.account;
      this._saveAccount();
      session.timeline.push(...(result.events || []));
      this._syncPositionSummary(symbol);
      if (!session.hasPosition) session.tradeLevels = null;
    });

    let sessionData = null;
    try {
      sessionData = SessionJournalService.buildSessionPayload({
        account: this.account,
        symbol,
        timelineEvents: session.timeline,
        decisions: session.decisions,
        userId: session.userId,
        sessionId: session.id,
        startTime: session.startedAt,
        startingCapital: session.startingCapital,
      });
      await SessionJournalService.saveSession(sessionData);
      session._journal = sessionData;
    } catch (err) {
      console.warn(`AISessionManager: Failed to persist session for ${symbol}:`, err);
    }

    this._notifyListeners();
    return sessionData;
  }

  /**
   * Stops ALL active sessions (emergency stop / app shutdown).
   */
  async stopAllSessions() {
    const symbols = [...this.sessions.keys()].filter(s => this.sessions.get(s).isActive);
    const results = [];
    for (const symbol of symbols) {
      const result = await this.stopSession(symbol);
      if (result) results.push(result);
    }
    return results;
  }

  /**
   * Returns all active session states.
   */
  getActiveSessions() {
    return [...this.sessions.values()].filter(s => s.isActive);
  }

  /**
   * Returns all sessions (active + stopped).
   */
  getAllSessions() {
    return [...this.sessions.values()];
  }

  /**
   * Returns session state for a specific symbol.
   */
  getSession(symbol) {
    const cleanSymbol = normalizeSymbol(symbol);
    return this.sessions.get(cleanSymbol) || null;
  }

  /**
   * Checks if a session exists and is active for the given symbol.
   */
  isSessionActive(symbol) {
    const cleanSymbol = normalizeSymbol(symbol);
    const session = this.sessions.get(cleanSymbol);
    return session?.isActive || false;
  }

  // ─── Background Polling Loops ────────────────────────────────

  _startSessionPolling(symbol) {
    const session = this.sessions.get(symbol);
    if (!session) return;

    this._stopSessionPolling(symbol);

    // Initial data fetch
    void this._fetchPrice(symbol);
    void this._fetchCandles(symbol);

    // Price tick every 10 seconds
    session._priceInterval = setInterval(() => {
      if (session.isActive) void this._fetchPrice(symbol);
    }, 10000);

    // Candle refresh every 30 seconds
    session._candleInterval = setInterval(() => {
      if (session.isActive) void this._fetchCandles(symbol);
    }, 30000);
  }

  _stopSessionPolling(symbol) {
    const session = this.sessions.get(symbol);
    if (!session) return;

    if (session._priceInterval) {
      clearInterval(session._priceInterval);
      session._priceInterval = null;
    }
    if (session._candleInterval) {
      clearInterval(session._candleInterval);
      session._candleInterval = null;
    }
  }

  async _fetchPrice(symbol) {
    const session = this.sessions.get(symbol);
    if (!session || !session.isActive) return;
    const requestId = ++session._priceRequestId;

    try {
      const res = await api.getPrice(session.formattedSymbol);
      if (!this._isCurrentRequest(symbol, session, '_priceRequestId', requestId)) return;

      const price = Number(res?.price);
      if (res?.price !== 'N/A' && Number.isFinite(price) && price > 0) {
        session.price = price;
        session.change = toFiniteNumber(res.change);
        session.changePct = toFiniteNumber(res.pct ?? res.changePct);
        session._priceStale = false;
        this._syncStaleState(session);
        session.lastTickTime = Date.now();

        // Run position management on each tick
        await this._evaluatePosition(symbol, session);
        this._notifyListeners();
      } else {
        session._priceStale = true;
        this._syncStaleState(session);
        if (session.status !== SESSION_STATUS.POSITION_ACTIVE) {
          session.status = SESSION_STATUS.DATA_DISCONNECTED;
        }
        this._notifyListeners();
      }
    } catch (err) {
      if (!this._isCurrentRequest(symbol, session, '_priceRequestId', requestId)) return;
      console.warn(`AISessionManager: Price fetch failed for ${symbol}:`, err);
      session._priceStale = true;
      this._syncStaleState(session);
      if (session.status !== SESSION_STATUS.POSITION_ACTIVE) {
        session.status = SESSION_STATUS.DATA_DISCONNECTED;
      }
      this._notifyListeners();
    }
  }

  async _fetchCandles(symbol) {
    const session = this.sessions.get(symbol);
    if (!session || !session.isActive) return;
    const requestId = ++session._candleRequestId;

    try {
      const config = TIMEFRAME_CONFIG[session.timeframe] || TIMEFRAME_CONFIG['5m'];
      const res = await api.getHistory(session.formattedSymbol, config.period, config.interval);
      if (!this._isCurrentRequest(symbol, session, '_candleRequestId', requestId)) return;

      let candles = Array.isArray(res?.data) ? res.data : [];

      if (candles.length === 0) {
        // Fallback to longer timeframe
        const fallbackRes = await api.getHistory(session.formattedSymbol, '5d', '15m');
        if (!this._isCurrentRequest(symbol, session, '_candleRequestId', requestId)) return;
        candles = Array.isArray(fallbackRes?.data) ? fallbackRes.data : [];
      }

      if (candles.length === 0) {
        session._candleStale = true;
        this._syncStaleState(session);
        if (session.status !== SESSION_STATUS.POSITION_ACTIVE) {
          session.status = SESSION_STATUS.DATA_DISCONNECTED;
        }
        this._notifyListeners();
        return;
      }

      session.chartData = candles;
      session._candleStale = false;
      this._syncStaleState(session);
      session.marketContext = this.marketContext;

      const analysis = SetupAnalyzer.analyze(session.symbol, candles, this.marketContext);
      session.technicalAnalysis = analysis;

      if (analysis) {
        await this._evaluateDecision(symbol, session);
      } else if (!session.hasPosition) {
        session.tradeDecision = AITradingDecisionEngine.evaluate(null, session.price, this.marketContext);
        session.tradeLevels = null;
        session.status = session.isStaleData ? SESSION_STATUS.DATA_DISCONNECTED : SESSION_STATUS.WAITING;
      }
      this._notifyListeners();
    } catch (err) {
      if (!this._isCurrentRequest(symbol, session, '_candleRequestId', requestId)) return;
      console.warn(`AISessionManager: Candle fetch failed for ${symbol}:`, err);
      session._candleStale = true;
      this._syncStaleState(session);
      if (session.status !== SESSION_STATUS.POSITION_ACTIVE) {
        session.status = SESSION_STATUS.DATA_DISCONNECTED;
      }
      this._notifyListeners();
    }
  }

  // ─── Trading Decision Engine ─────────────────────────────────

  async _evaluateDecision(symbol, expectedSession = null) {
    const session = this.sessions.get(symbol);
    if (!session || session !== (expectedSession || session) || !session.isActive || !session.technicalAnalysis || session.price <= 0) return;

    try {
      const decision = AITradingDecisionEngine.evaluate(
        session.technicalAnalysis,
        session.price,
        this.marketContext
      );
      session.tradeDecision = decision;

      // Update session status based on decision
      if (this._hasPositionForSymbol(symbol)) {
        session.status = SESSION_STATUS.POSITION_ACTIVE;
      } else if (session.isStaleData) {
        session.status = SESSION_STATUS.DATA_DISCONNECTED;
      } else if (decision.decision === 'BUY' || decision.decision === 'SHORT') {
        session.status = SESSION_STATUS.RUNNING;
      } else if (decision.invalidation?.includes('waiting')) {
        session.status = SESSION_STATUS.WAITING_CONFIRMATION;
      } else {
        session.status = SESSION_STATUS.WAITING;
      }

      // Update trade levels for chart overlay
      if (decision.decision !== 'WAIT' && decision.entry) {
        session.tradeLevels = {
          entry: decision.entry,
          stopLoss: decision.stopLoss,
          target1: decision.target1,
          target2: decision.target2,
          direction: decision.direction,
        };
      }

      // Add timeline event for setup detection
      if (decision.decision !== 'WAIT') {
        const lastEvent = session.timeline[session.timeline.length - 1];
        if (!lastEvent || !lastEvent.title.includes(decision.decision)) {
          session.timeline.push({
            id: Date.now(),
            time: new Date().toLocaleTimeString('en-US', { hour12: true }),
            title: `${decision.decision} Setup Validated`,
            detail: `Detected ${decision.setup?.replace(/_/g, ' ')}. Confidence: ${decision.confidence}%. Entry: ₹${decision.entry}.`,
            type: 'active',
          });
        }
      }

      // Attempt trade execution if signal is actionable
      if (
        (decision.decision === 'BUY' || decision.decision === 'SHORT') &&
        !this._hasPositionForSymbol(symbol) &&
        !session.hasExecuted
      ) {
        await this._attemptTradeExecution(symbol, decision, session);
      }

      // Reset execution flag when decision returns to WAIT
      if (decision.decision === 'WAIT') {
        session.hasExecuted = false;
      }

    } catch (err) {
      console.error(`AISessionManager: Decision evaluation error for ${symbol}:`, err);
      session.status = SESSION_STATUS.WAITING;
    }
  }

  // ─── Trade Execution (with concurrency lock) ──────────────────

  async _attemptTradeExecution(symbol, decision, expectedSession = null) {
    const session = this.sessions.get(symbol);
    if (!session || session !== (expectedSession || session) || !session.isActive) return;

    // Stale data guard
    if (session.isStaleData) {
      session.timeline.push({
        id: Date.now(),
        time: new Date().toLocaleTimeString('en-US', { hour12: true }),
        title: 'Trade Blocked: Stale Data',
        detail: 'Market data connection has an active error or stale quote. Order prevented. [STALE_DATA]',
        type: 'error',
      });
      session.status = SESSION_STATUS.DATA_DISCONNECTED;
      return;
    }

    await this._executeWithLock(async () => {
      // The lock can be queued behind another symbol. Revalidate everything
      // after acquiring it so an obsolete signal cannot execute later.
      if (
        this.sessions.get(symbol) !== session ||
        !session.isActive ||
        session.isStaleData ||
        session.tradeDecision !== decision ||
        this._hasPositionForSymbol(symbol) ||
        session.hasExecuted
      ) {
        return;
      }

      session.hasExecuted = true;

      // Risk Engine validation (atomic)
      const validation = RiskEngine.validateTrade({
        account: this.account,
        decision,
        stockInfo: { sym: session.symbol, price: session.price },
        customSettings: this.riskSettings,
      });

      // Record decision for journaling
      session.decisions.push({
        decision: decision.decision,
        direction: decision.direction,
        setup: decision.setup,
        confidence: decision.confidence,
        entry: decision.entry,
        stopLoss: decision.stopLoss,
        target1: decision.target1,
        target2: decision.target2,
        price: session.price,
        timestamp: new Date().toISOString(),
        accepted: validation.approved,
        rejectionReason: validation.approved ? null : `${validation.reason} [${validation.code}]`,
      });
      if (session.decisions.length > 500) session.decisions.splice(0, session.decisions.length - 500);

      if (!validation.approved) {
        session.timeline.push({
          id: Date.now(),
          time: new Date().toLocaleTimeString('en-US', { hour12: true }),
          title: 'Trade Rejected by Risk Engine',
          detail: `Reason: ${validation.reason} [${validation.code}]`,
          type: 'error',
        });
        session.status = SESSION_STATUS.RISK_LIMIT;
        return;
      }

      // Execute paper order
      const execution = PaperBroker.executeMarketOrder(
        this.account,
        {
          symbol: session.symbol,
          direction: decision.direction,
          entry: decision.entry,
          stopLoss: decision.stopLoss,
          target1: decision.target1,
          target2: decision.target2,
          setup: decision.setup,
          confidence: decision.confidence,
          customQuantity: validation.quantity,
          sessionId: session.id,
        }
      );

      this.account = execution.account;
      this._saveAccount();

      const orderEvents = execution.events || [];
      const pos = this._getPositionForSymbol(symbol);
      if (!execution.order || !pos || (pos.sessionId && pos.sessionId !== session.id)) {
        session.timeline.push(...orderEvents);
        session.timeline.push(this._timelineEvent(
          'Paper order was not filled',
          `The broker rejected or could not create a position for ${session.symbol}.`,
          'error'
        ));
        session.status = SESSION_STATUS.RISK_LIMIT;
        this._syncPositionSummary(symbol);
        return;
      }

      // Add chart marker
      const latestCandle = session.chartData[session.chartData.length - 1];
      const candleTime = latestCandle?.time || latestCandle?.date;
      if (candleTime && pos) {
        session.markers.push({
          time: candleTime,
          position: decision.direction === 'LONG' ? 'belowBar' : 'aboveBar',
          color: decision.direction === 'LONG' ? '#10B981' : '#EF4444',
          shape: decision.direction === 'LONG' ? 'arrowUp' : 'arrowDown',
          text: `▲ ${decision.direction === 'LONG' ? 'BUY' : 'SHORT'} @ ₹${pos.entryPrice} (${pos.quantity} Shs)`,
        });
      }

      session.timeline.push(...orderEvents);
      session.hasPosition = true;
      session.status = SESSION_STATUS.POSITION_ACTIVE;

      // Update position summary for UI
      this._syncPositionSummary(symbol);
      // Update trade levels to reflect actual entry
      if (pos) {
        session.tradeLevels = {
          entry: pos.entryPrice,
          stopLoss: pos.stopLoss,
          target1: pos.target1,
          target2: pos.target2,
          direction: pos.direction,
        };
      }
    });

    this._notifyListeners();
  }

  // ─── Position Management (runs on each price tick) ────────────

  async _evaluatePosition(symbol, expectedSession = null) {
    const session = this.sessions.get(symbol);
    if (!session || session !== (expectedSession || session) || !session.isActive || session.price <= 0) return;

    await this._executeWithLock(async () => {
      if (this.sessions.get(symbol) !== session || !session.isActive || session.price <= 0) return;

      let position = this._getPositionForSymbol(symbol);
      if (!position) {
        session.hasPosition = false;
        session.positionSummary = null;
        if (!session.tradeDecision || session.tradeDecision.decision === 'WAIT') {
          session.tradeLevels = null;
        }
        return;
      }

      // Update the requested symbol, not the legacy activePosition alias. This
      // keeps every position's P&L isolated in a multi-stock account.
      this.account = PaperTradingAccount.updateMarketPrice(this.account, symbol, session.price);
      position = this._getPositionForSymbol(symbol);
      if (!position) return;

      const evaluation = PositionManager.evaluatePosition({
        position,
        currentPrice: session.price,
        candleHigh: session.price,
        candleLow: session.price,
        technicalAnalysis: session.technicalAnalysis,
        latestDecision: session.tradeDecision,
        riskSettings: this.riskSettings,
      });

      const latestCandle = session.chartData[session.chartData.length - 1];
      const candleTime = latestCandle?.time || latestCandle?.date;
      let currentAccount = this.account;

      if (evaluation.action === POSITION_DECISION.PARTIAL_EXIT) {
        const exitResult = PaperBroker.closePosition(
          currentAccount, session.price, evaluation.reason, evaluation.exitQuantity, symbol
        );
        currentAccount = exitResult.account;
        session.timeline.push(...exitResult.events);

        // Move stop to breakeven
        const pos = this._getPositionForSymbol(symbol, currentAccount);
        if (pos) {
          const beStop = pos.direction === 'LONG'
            ? parseFloat((pos.entryPrice * 1.0005).toFixed(2))
            : parseFloat((pos.entryPrice * 0.9995).toFixed(2));
          const beResult = PaperBroker.updateStopLoss(currentAccount, beStop, 'Stop moved to break-even', symbol);
          if (beResult.updated) {
            currentAccount = beResult.account;
            session.timeline.push(...beResult.events);
          }
        }

        if (candleTime) {
          session.markers.push({
            time: candleTime,
            position: position.direction === 'LONG' ? 'aboveBar' : 'belowBar',
            color: '#F59E0B',
            shape: 'circle',
            text: `PARTIAL: ${evaluation.exitQuantity} @ ₹${exitResult.fillPrice || session.price}`,
          });
        }

      } else if (evaluation.action === POSITION_DECISION.MOVE_TO_BREAKEVEN) {
        const updateResult = PaperBroker.updateStopLoss(currentAccount, evaluation.newStop, 'Stop moved to break-even', symbol);
        if (updateResult.updated) {
          currentAccount = updateResult.account;
          session.timeline.push(...updateResult.events);
        }

      } else if (evaluation.action === POSITION_DECISION.TRAIL_STOP) {
        const updateResult = PaperBroker.updateStopLoss(currentAccount, evaluation.newStop, 'Trailing stop ratcheted', symbol);
        if (updateResult.updated) {
          currentAccount = updateResult.account;
          session.timeline.push(...updateResult.events);
        }

      } else if (evaluation.action === POSITION_DECISION.TAKE_PROFIT || evaluation.action === POSITION_DECISION.EXIT) {
        const exitResult = PaperBroker.closePosition(currentAccount, session.price, evaluation.reason, null, symbol);
        currentAccount = exitResult.account;
        session.timeline.push(...exitResult.events);
        session.hasPosition = false;
        session.positionSummary = null;
        session.status = SESSION_STATUS.WAITING;

        if (candleTime) {
          const isTarget = evaluation.markerType === 'TARGET';
          const isStop = evaluation.markerType === 'STOP';
          session.markers.push({
            time: candleTime,
            position: position.direction === 'LONG' ? 'aboveBar' : 'belowBar',
            color: isTarget ? '#10B981' : (isStop ? '#EF4444' : '#64748B'),
            shape: isStop ? 'square' : 'circle',
            text: `${evaluation.markerType || 'EXIT'}: ${session.symbol} @ ₹${exitResult.fillPrice || session.price}`,
          });
        }
      }

      this.account = currentAccount;
      this._saveAccount();
      this._syncPositionSummary(symbol);

      // Update trade levels
      const activePos = this._getPositionForSymbol(symbol);
      if (activePos) {
        session.tradeLevels = {
          entry: activePos.entryPrice,
          stopLoss: activePos.stopLoss,
          target1: activePos.target1,
          target2: activePos.target2,
          direction: activePos.direction,
        };
      } else if (!session.hasPosition) {
        session.tradeLevels = null;
      }
    });
  }

  // ─── Position Helpers ─────────────────────────────────────────

  _hasPositionForSymbol(symbol) {
    const cleanSym = normalizeSymbol(symbol);
    if (this.account?.activePositions && this.account.activePositions.length > 0) {
      return this.account.activePositions.some(p => normalizeSymbol(p.symbol) === cleanSym);
    }
    return normalizeSymbol(this.account?.activePosition?.symbol) === cleanSym;
  }

  _getPositionForSymbol(symbol, account = this.account) {
    const cleanSym = normalizeSymbol(symbol);
    if (account?.activePositions && account.activePositions.length > 0) {
      return account.activePositions.find(p => normalizeSymbol(p.symbol) === cleanSym) || null;
    }
    if (normalizeSymbol(account?.activePosition?.symbol) === cleanSym) {
      return account.activePosition;
    }
    return null;
  }

  _syncPositionSummary(symbol) {
    const session = this.sessions.get(symbol);
    if (!session) return;

    const pos = this._getPositionForSymbol(symbol);
    if (pos) {
      session.hasPosition = true;
      session.positionSummary = {
        direction: pos.direction,
        entry: pos.entryPrice,
        stopLoss: pos.stopLoss,
        target1: pos.target1,
        target2: pos.target2,
        quantity: pos.quantity,
        remainingQuantity: pos.remainingQuantity ?? pos.quantity,
        unrealizedPnL: toFiniteNumber(pos.unrealizedPnL),
        pnlPct: toFiniteNumber(pos.pnlPct),
        currentPrice: toFiniteNumber(pos.currentPrice, session.price),
      };
    } else {
      session.hasPosition = false;
      session.positionSummary = null;
    }
  }

  // ─── Account Persistence ──────────────────────────────────────

  _saveAccount() {
    try {
      PaperTradingAccount.save(this.account);
    } catch (e) {
      console.warn('AISessionManager: Failed to save account', e);
    }
  }

  _isCurrentRequest(symbol, session, requestField, requestId) {
    return this.sessions.get(symbol) === session &&
      session.isActive &&
      session[requestField] === requestId;
  }

  _syncStaleState(session) {
    session.isStaleData = Boolean(session._priceStale || session._candleStale);
  }

  _timelineEvent(title, detail, type = 'info') {
    return {
      id: `${Date.now()}_${++this._eventSequence}`,
      time: new Date().toLocaleTimeString('en-US', { hour12: true }),
      title,
      detail,
      type,
    };
  }

  // ─── Concurrency Lock ─────────────────────────────────────────
  async _executeWithLock(fn) {
    // Simple mutex: wait if another order is in flight
    while (this._orderLock) {
      await new Promise(r => setTimeout(r, 10));
    }
    this._orderLock = true;
    try {
      await fn();
    } finally {
      this._orderLock = false;
    }
  }

  // ─── Observer Pattern (UI Subscriptions) ───────────────────────

  /**
   * Subscribe to state changes. Returns an unsubscribe function.
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  subscribe(callback) {
    this.listeners.add(callback);
    callback(this._getSnapshot());
    return () => this.listeners.delete(callback);
  }

  getSnapshot() {
    return this._getSnapshot();
  }

  _notifyListeners() {
    const snapshot = this._getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('AISessionManager: listener error:', err);
      }
    }
  }

  _getSnapshot() {
    return {
      sessions: Object.fromEntries(
        [...this.sessions.entries()].map(([key, session]) => [key, {
          id: session.id,
          symbol: session.symbol,
          status: session.status,
          isActive: session.isActive,
          price: session.price,
          change: session.change,
          changePct: session.changePct,
          hasPosition: session.hasPosition,
          positionSummary: session.positionSummary,
          tradeLevels: session.tradeLevels,
          markers: session.markers,
          timeline: session.timeline,
          technicalAnalysis: session.technicalAnalysis,
          tradeDecision: session.tradeDecision,
          chartData: session.chartData,
          isStaleData: session.isStaleData,
          startedAt: session.startedAt,
          stoppedAt: session.stoppedAt,
          timeframe: session.timeframe,
          lastTickTime: session.lastTickTime,
          decisions: [...session.decisions],
          userId: session.userId,
        }])
      ),
      account: this.account,
      marketContext: this.marketContext,
      activeCount: this.getActiveSessions().length,
    };
  }

  // ─── Manual Actions from UI ────────────────────────────────────

  /**
   * Manually close the position for a given symbol.
   */
  async manualClosePosition(symbol) {
    const cleanSymbol = normalizeSymbol(symbol);
    const session = this.sessions.get(cleanSymbol);
    if (!session) return;

    if (this._hasPositionForSymbol(cleanSymbol) && session.price > 0) {
      await this._executeWithLock(async () => {
        if (this.sessions.get(cleanSymbol) !== session || !this._hasPositionForSymbol(cleanSymbol)) return;
        const { account: updated, events } = PaperBroker.closePosition(
          this.account,
          session.price,
          'Manual exit by trader',
          null,
          cleanSymbol
        );
        this.account = updated;
        this._saveAccount();
        session.timeline.push(...events);
        session.hasPosition = false;
        session.positionSummary = null;
        session.tradeLevels = null;
        session.status = SESSION_STATUS.WAITING;
      });
      this._notifyListeners();
    }
  }

  /**
   * Change timeframe for a session and refetch candles.
   */
  changeTimeframe(symbol, newTimeframe) {
    const cleanSymbol = normalizeSymbol(symbol);
    const session = this.sessions.get(cleanSymbol);
    if (!session || !session.isActive || !TIMEFRAME_CONFIG[newTimeframe]) return false;

    session.timeframe = newTimeframe;
    session._candleStale = true;
    this._syncStaleState(session);
    void this._fetchCandles(cleanSymbol);
    this._notifyListeners();
    return true;
  }

  /**
   * Manually refresh price quote and candles for a session.
   */
  async refreshSession(symbol) {
    const cleanSymbol = normalizeSymbol(symbol);
    await Promise.allSettled([
      this._fetchPrice(cleanSymbol),
      this._fetchCandles(cleanSymbol),
    ]);
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  /**
   * Full teardown — stops all sessions and clears intervals.
   */
  destroy() {
    this._clearRuntimeSessions();
    if (this._contextInterval) {
      clearInterval(this._contextInterval);
      this._contextInterval = null;
    }
    this.listeners.clear();
    this.account = null;
    this.riskSettings = null;
    this.marketContext = null;
    this.userId = 'guest';
    this._initialized = false;
  }

  _clearRuntimeSessions() {
    for (const [symbol, session] of this.sessions) {
      session.isActive = false;
      session._priceRequestId += 1;
      session._candleRequestId += 1;
      this._stopSessionPolling(symbol);
    }
    this.sessions.clear();
  }

  /**
   * Safe application/logout teardown. Active positions are liquidated and
   * journals persisted before runtime state and timers are discarded.
   */
  async shutdown({ liquidate = true } = {}) {
    const journals = liquidate ? await this.stopAllSessions() : [];
    this.destroy();
    return journals;
  }
}

// ─── Export Singleton Instance ────────────────────────────────────
export const AISessionManager = new AISessionManagerSingleton();
