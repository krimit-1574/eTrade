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

// ─── Individual Session State ────────────────────────────────────
function createSessionState(symbol, config = {}) {
  const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '');
  const formattedSymbol = cleanSymbol.includes('.') ? cleanSymbol : `${cleanSymbol}.NS`;

  return {
    // Identity
    id: `session_${cleanSymbol}_${Date.now()}`,
    symbol: cleanSymbol,
    formattedSymbol,
    timeframe: config.timeframe || '5m',

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
    isStaleData: false,
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
  };
}

// ─── Singleton Manager ────────────────────────────────────────────
class AISessionManagerSingleton {
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

    /** Market context refresh interval */
    this._contextInterval = null;

    this._initialized = false;
  }

  // ─── Initialization ──────────────────────────────────────────
  initialize(account, riskSettings) {
    this.account = account || this.account || PaperTradingAccount.load();
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
  }

  async _refreshMarketContext() {
    try {
      this.marketContext = await MarketContextService.fetchMarketIndices();
    } catch (err) {
      console.warn('AISessionManager: market context refresh failed:', err);
    }
  }

  // ─── Account Management ──────────────────────────────────────
  getAccount() {
    return this.account;
  }

  updateAccount(account) {
    this.account = account;
    this._notifyListeners();
  }

  updateRiskSettings(settings) {
    this.riskSettings = settings;
    // Propagate to all active sessions
    this._notifyListeners();
  }

  // ─── Session Lifecycle ───────────────────────────────────────
  /**
   * Starts a new AI intraday session for the given symbol.
   * If a session already exists for this symbol, returns the existing one.
   * @returns {object} session state
   */
  startSession(symbol, config = {}) {
    const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '');

    if (this.sessions.has(cleanSymbol)) {
      const existing = this.sessions.get(cleanSymbol);
      if (existing.isActive) {
        console.warn(`AISessionManager: Session already active for ${cleanSymbol}`);
        return existing;
      }
      // Previous session was stopped — remove and start fresh
      this.sessions.delete(cleanSymbol);
    }

    // Check max simultaneous sessions from risk settings
    const maxSessions = this.riskSettings?.maxSimultaneousPositions || 5;
    const activeSessions = this.getActiveSessions();
    if (activeSessions.length >= maxSessions) {
      console.warn(`AISessionManager: Max simultaneous sessions (${maxSessions}) reached`);
      return null;
    }

    const session = createSessionState(cleanSymbol, config);
    this.sessions.set(cleanSymbol, session);

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
    const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '');
    const session = this.sessions.get(cleanSymbol);
    if (!session) return null;

    session.isActive = false;
    session.status = SESSION_STATUS.STOPPED;
    session.stoppedAt = new Date().toISOString();

    // Stop polling
    this._stopSessionPolling(cleanSymbol);

    // Liquidate any open position for this symbol
    if (this._hasPositionForSymbol(cleanSymbol) && session.price > 0) {
      await this._executeWithLock(async () => {
        const position = this._getPositionForSymbol(cleanSymbol);
        if (position) {
          const { account: closedAccount, events } = PaperBroker.closePosition(
            this.account,
            session.price,
            'AI session manually stopped by user.',
            null, // exitQuantity (full)
            cleanSymbol
          );
          this.account = closedAccount;
          this._saveAccount();
          session.timeline.push(...events);
          session.hasPosition = false;
          session.positionSummary = null;
          session.tradeLevels = null;
        }
      });
    }

    // Build and persist session journal
    let sessionData = null;
    try {
      sessionData = SessionJournalService.buildSessionPayload({
        account: this.account,
        symbol: cleanSymbol,
        decisions: session.decisions,
        userId: 'guest',
      });
      await SessionJournalService.saveSession(sessionData);
    } catch (err) {
      console.warn(`AISessionManager: Failed to persist session for ${cleanSymbol}:`, err);
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
    const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '');
    return this.sessions.get(cleanSymbol) || null;
  }

  /**
   * Checks if a session exists and is active for the given symbol.
   */
  isSessionActive(symbol) {
    const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '');
    const session = this.sessions.get(cleanSymbol);
    return session?.isActive || false;
  }

  // ─── Background Polling Loops ────────────────────────────────

  _startSessionPolling(symbol) {
    const session = this.sessions.get(symbol);
    if (!session) return;

    // Initial data fetch
    this._fetchPrice(symbol);
    this._fetchCandles(symbol);

    // Price tick every 10 seconds
    session._priceInterval = setInterval(() => {
      if (session.isActive) this._fetchPrice(symbol);
    }, 10000);

    // Candle refresh every 30 seconds
    session._candleInterval = setInterval(() => {
      if (session.isActive) this._fetchCandles(symbol);
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

    try {
      const res = await api.getPrice(session.formattedSymbol);
      if (res && res.price !== 'N/A') {
        session.price = parseFloat(res.price || 0);
        session.change = parseFloat(res.change || 0);
        session.changePct = parseFloat(res.pct || 0);
        session.isStaleData = false;
        session.lastTickTime = Date.now();

        // Run position management on each tick
        this._evaluatePosition(symbol);
        this._notifyListeners();
      } else {
        session.isStaleData = true;
        this._notifyListeners();
      }
    } catch (err) {
      console.warn(`AISessionManager: Price fetch failed for ${symbol}:`, err);
      session.isStaleData = true;
      this._notifyListeners();
    }
  }

  async _fetchCandles(symbol) {
    const session = this.sessions.get(symbol);
    if (!session || !session.isActive) return;

    try {
      const config = TIMEFRAME_CONFIG[session.timeframe] || TIMEFRAME_CONFIG['5m'];
      const res = await api.getHistory(session.formattedSymbol, config.period, config.interval);

      if (res && Array.isArray(res.data) && res.data.length > 0) {
        session.chartData = res.data;
        session.isStaleData = false;

        // Run technical analysis
        const analysis = SetupAnalyzer.analyze(session.symbol, res.data, this.marketContext);
        session.technicalAnalysis = analysis;

        // Evaluate trading decision
        this._evaluateDecision(symbol);
        this._notifyListeners();
      } else {
        // Fallback to longer timeframe
        const fallbackRes = await api.getHistory(session.formattedSymbol, '5d', '15m');
        if (fallbackRes && Array.isArray(fallbackRes.data) && fallbackRes.data.length > 0) {
          session.chartData = fallbackRes.data;
          const analysis = SetupAnalyzer.analyze(session.symbol, fallbackRes.data, this.marketContext);
          session.technicalAnalysis = analysis;
          this._evaluateDecision(symbol);
          this._notifyListeners();
        }
      }
    } catch (err) {
      console.warn(`AISessionManager: Candle fetch failed for ${symbol}:`, err);
      session.isStaleData = true;
      if (session.status !== SESSION_STATUS.POSITION_ACTIVE) {
        session.status = SESSION_STATUS.DATA_DISCONNECTED;
      }
      this._notifyListeners();
    }
  }

  // ─── Trading Decision Engine ─────────────────────────────────

  _evaluateDecision(symbol) {
    const session = this.sessions.get(symbol);
    if (!session || !session.isActive || !session.technicalAnalysis || session.price <= 0) return;

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
        this._attemptTradeExecution(symbol, decision);
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

  async _attemptTradeExecution(symbol, decision) {
    const session = this.sessions.get(symbol);
    if (!session || !session.isActive) return;

    session.hasExecuted = true;

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
      const { account: updatedAccount, events: orderEvents } = PaperBroker.executeMarketOrder(
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
        }
      );

      this.account = updatedAccount;
      this._saveAccount();

      // Add chart marker
      const latestCandle = session.chartData[session.chartData.length - 1];
      const candleTime = latestCandle?.time || latestCandle?.date;
      const pos = this._getPositionForSymbol(symbol);
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

  _evaluatePosition(symbol) {
    const session = this.sessions.get(symbol);
    if (!session || !session.isActive || session.price <= 0) return;

    if (!this._hasPositionForSymbol(symbol)) {
      session.hasPosition = false;
      session.positionSummary = null;
      // Only clear tradeLevels if we also have no pending decision
      if (!session.tradeDecision || session.tradeDecision.decision === 'WAIT') {
        session.tradeLevels = null;
      }
      return;
    }

    const position = this._getPositionForSymbol(symbol);
    if (!position) return;

    // Update unrealized P&L on the account
    const updatedAccount = { ...this.account };
    if (updatedAccount.activePosition && updatedAccount.activePosition.symbol === symbol) {
      const pos = updatedAccount.activePosition;
      if (pos.direction === 'LONG') {
        pos.unrealizedPnL = (session.price - pos.entryPrice) * pos.quantity;
      } else {
        pos.unrealizedPnL = (pos.entryPrice - session.price) * pos.quantity;
      }
      pos.currentPrice = session.price;
      pos.pnlPct = pos.entryPrice > 0 ? ((pos.unrealizedPnL / (pos.entryPrice * pos.quantity)) * 100) : 0;
      updatedAccount.unrealizedPnL = pos.unrealizedPnL;
      updatedAccount.accountValue = updatedAccount.availableCash + updatedAccount.usedCapital + updatedAccount.unrealizedPnL;
    }
    this.account = updatedAccount;

    // Run PositionManager evaluation
    const evaluation = PositionManager.evaluatePosition({
      position,
      currentPrice: session.price,
      candleHigh: session.price, // Use current price as proxy when no candle high available
      candleLow: session.price,
      technicalAnalysis: session.technicalAnalysis,
      latestDecision: session.tradeDecision,
      riskSettings: this.riskSettings,
    });

    const latestCandle = session.chartData[session.chartData.length - 1];
    const candleTime = latestCandle?.time || latestCandle?.date;

    // Execute position management decisions
    this._executeWithLock(async () => {
      let currentAccount = { ...this.account };

      if (evaluation.action === POSITION_DECISION.PARTIAL_EXIT) {
        const exitResult = PaperBroker.closePosition(
          currentAccount, session.price, evaluation.reason, evaluation.exitQuantity, symbol
        );
        currentAccount = exitResult.account;
        session.timeline.push(...exitResult.events);

        // Move stop to breakeven
        const pos = this._getPositionForSymbol(symbol);
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

    this._notifyListeners();
  }

  // ─── Position Helpers ─────────────────────────────────────────

  _hasPositionForSymbol(symbol) {
    const cleanSym = (symbol || '').toUpperCase().replace('.NS', '');
    if (this.account?.activePositions && this.account.activePositions.length > 0) {
      return this.account.activePositions.some(p => (p.symbol || '').toUpperCase().replace('.NS', '') === cleanSym);
    }
    return (this.account?.activePosition?.symbol || '').toUpperCase().replace('.NS', '') === cleanSym;
  }

  _getPositionForSymbol(symbol) {
    const cleanSym = (symbol || '').toUpperCase().replace('.NS', '');
    if (this.account?.activePositions && this.account.activePositions.length > 0) {
      return this.account.activePositions.find(p => (p.symbol || '').toUpperCase().replace('.NS', '') === cleanSym) || null;
    }
    if ((this.account?.activePosition?.symbol || '').toUpperCase().replace('.NS', '') === cleanSym) {
      return this.account.activePosition;
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
        remainingQuantity: pos.remainingQuantity || pos.quantity,
        unrealizedPnL: pos.unrealizedPnL || 0,
        pnlPct: pos.pnlPct || 0,
        currentPrice: pos.currentPrice || session.price,
      };
    } else {
      session.hasPosition = false;
      session.positionSummary = null;
    }
  }

  // ─── Account Persistence ──────────────────────────────────────

  _saveAccount() {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('etrade_paper_account', JSON.stringify(this.account));
      }
    } catch (e) {
      console.warn('AISessionManager: Failed to save account', e);
    }
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
    return () => this.listeners.delete(callback);
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
    const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '');
    const session = this.sessions.get(cleanSymbol);
    if (!session) return;

    if (this._hasPositionForSymbol(cleanSymbol) && session.price > 0) {
      await this._executeWithLock(async () => {
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
    const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '');
    const session = this.sessions.get(cleanSymbol);
    if (!session || !session.isActive) return;

    session.timeframe = newTimeframe;
    this._fetchCandles(cleanSymbol);
  }

  /**
   * Manually refresh price quote and candles for a session.
   */
  async refreshSession(symbol) {
    const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '');
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
    for (const [symbol] of this.sessions) {
      this._stopSessionPolling(symbol);
    }
    if (this._contextInterval) {
      clearInterval(this._contextInterval);
      this._contextInterval = null;
    }
    this.sessions.clear();
    this.listeners.clear();
    this._initialized = false;
  }
}

// ─── Export Singleton Instance ────────────────────────────────────
export const AISessionManager = new AISessionManagerSingleton();
