/**
 * useAISessionManager.js
 * React hooks for observing the background AISessionManager.
 *
 * These hooks provide reactive state to UI components without giving
 * them control over the trading engine itself. The UI observes; the
 * engine runs independently in the background.
 *
 * ⚠️ PAPER TRADING ONLY.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AISessionManager } from '../services/TechnicalAnalysis/AISessionManager';
import { PaperTradingAccount } from '../services/TechnicalAnalysis/PaperTradingAccount';
import { RiskEngine } from '../services/TechnicalAnalysis/RiskEngine';

/**
 * Hook: Subscribe to the full AISessionManager state.
 * Returns a snapshot that updates whenever the manager notifies.
 */
export function useAISessionManager() {
  const [snapshot, setSnapshot] = useState(() => ({
    sessions: {},
    account: null,
    marketContext: null,
    activeCount: 0,
  }));

  const initializedRef = useRef(false);

  useEffect(() => {
    // Initialize the manager on first use
    if (!initializedRef.current) {
      initializedRef.current = true;
      const account = PaperTradingAccount.load();
      const riskSettings = RiskEngine.loadSettings();
      AISessionManager.initialize(account, riskSettings);
    }

    // Subscribe to state changes
    const unsubscribe = AISessionManager.subscribe((newSnapshot) => {
      setSnapshot({ ...newSnapshot });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const startSession = useCallback((symbol, config) => {
    return AISessionManager.startSession(symbol, config);
  }, []);

  const stopSession = useCallback(async (symbol) => {
    return AISessionManager.stopSession(symbol);
  }, []);

  const stopAllSessions = useCallback(async () => {
    return AISessionManager.stopAllSessions();
  }, []);

  const manualClosePosition = useCallback(async (symbol) => {
    return AISessionManager.manualClosePosition(symbol);
  }, []);

  const changeTimeframe = useCallback((symbol, newTimeframe) => {
    AISessionManager.changeTimeframe(symbol, newTimeframe);
  }, []);

  const updateRiskSettings = useCallback((settings) => {
    AISessionManager.updateRiskSettings(settings);
  }, []);

  const isSessionActive = useCallback((symbol) => {
    return AISessionManager.isSessionActive(symbol);
  }, []);

  return {
    snapshot,
    sessions: snapshot.sessions,
    account: snapshot.account,
    marketContext: snapshot.marketContext,
    activeCount: snapshot.activeCount,

    // Actions
    startSession,
    stopSession,
    stopAllSessions,
    manualClosePosition,
    changeTimeframe,
    updateRiskSettings,
    isSessionActive,

    // Direct reference for imperative access
    manager: AISessionManager,
  };
}

/**
 * Hook: Subscribe to a single session's state by symbol.
 */
export function useAISession(symbol) {
  const { snapshot, stopSession, manualClosePosition, changeTimeframe } = useAISessionManager();

  const cleanSymbol = (symbol || '').toUpperCase().replace('.NS', '');
  const session = snapshot.sessions?.[cleanSymbol] || null;

  return {
    session,
    isActive: session?.isActive || false,
    status: session?.status || null,
    price: session?.price || 0,
    chartData: session?.chartData || [],
    markers: session?.markers || [],
    timeline: session?.timeline || [],
    tradeLevels: session?.tradeLevels || null,
    positionSummary: session?.positionSummary || null,
    technicalAnalysis: session?.technicalAnalysis || null,
    tradeDecision: session?.tradeDecision || null,
    isStaleData: session?.isStaleData || false,

    stopSession: () => stopSession(cleanSymbol),
    closePosition: () => manualClosePosition(cleanSymbol),
    changeTimeframe: (tf) => changeTimeframe(cleanSymbol, tf),
  };
}
