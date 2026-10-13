import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import AIIntradayHeader from '../components/ai-intraday/AIIntradayHeader';
import AIIntradayStats from '../components/ai-intraday/AIIntradayStats';
import IntradayOpportunityTable from '../components/ai-intraday/IntradayOpportunityTable';
import AIIntradayWorkspace from '../components/ai-intraday/AIIntradayWorkspace';
import AIPastSessionsList from '../components/ai-intraday/AIPastSessionsList';
import AISessionOverviewModal from '../components/ai-intraday/AISessionOverviewModal';
import MultiAIOverviewPanel from '../components/ai-intraday/MultiAIOverviewPanel';
import { IntradayScanner } from '../services/IntradayScanner';
import { MarketContextService } from '../services/TechnicalAnalysis/MarketContextService';
import { PaperTradingAccount } from '../services/TechnicalAnalysis/PaperTradingAccount';
import { useAISessionManager } from '../hooks/useAISessionManager';

export default function AIIntradayPage({ user, activeSymbol, onStartAI, onBackToDashboard }) {
  const [aiState, setAiState] = useState('READY');
  const [isLoading, setIsLoading] = useState(true);
  const [opportunities, setOpportunities] = useState([]);
  const [lastAnalysed, setLastAnalysed] = useState('');
  const [marketStatus, setMarketStatus] = useState('OPEN');
  const [marketStatusNote, setMarketStatusNote] = useState('');
  const [dataSource, setDataSource] = useState('Real Market Data');
  const [isFallback, setIsFallback] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [paperAccount, setPaperAccount] = useState(() => PaperTradingAccount.load());

  // Multi-Session Manager Hook
  const {
    sessions,
    account: managerAccount,
    marketContext,
    activeCount,
    startSession,
    stopSession,
    stopAllSessions,
    isSessionActive,
  } = useAISessionManager();

  // Sync paper account from manager when it updates
  useEffect(() => {
    if (managerAccount) {
      setPaperAccount(managerAccount);
    }
  }, [managerAccount]);

  // Fetch market context (NIFTY, BANK NIFTY, SENSEX) — fallback if manager hasn't loaded it
  const [localMarketContext, setLocalMarketContext] = useState(null);
  useEffect(() => {
    if (!activeSymbol && !marketContext) {
      MarketContextService.fetchMarketIndices()
        .then(res => setLocalMarketContext(res))
        .catch(err => console.warn('AIIntradayPage: market context fetch error:', err));
    }
  }, [activeSymbol, marketContext]);

  const displayMarketContext = marketContext || localMarketContext;

  const runScanner = useCallback(async (force = false) => {
    setIsLoading(true);
    setAiState('ANALYSING');

    try {
      const result = await IntradayScanner.scanMarket(force);

      setOpportunities(result.opportunities || []);
      setLastAnalysed(result.lastAnalysed || new Date().toLocaleTimeString('en-US', { hour12: true }));
      setMarketStatus(result.marketStatus || 'OPEN');
      setMarketStatusNote(result.marketStatusNote || '');
      setDataSource(result.dataSource || 'Real Market Data');
      setIsFallback(result.isFallback || false);
      setError(result.error || null);
    } catch (err) {
      console.error('Failed to run IntradayScanner:', err);
      setError({ message: 'Error scanning market data. Using cached data.' });
    } finally {
      setIsLoading(false);
      setAiState('READY');
    }
  }, []);

  useEffect(() => {
    if (!activeSymbol) {
      setPaperAccount(PaperTradingAccount.load());
      runScanner(false);
    }
  }, [runScanner, activeSymbol]);

  const handleRefresh = () => {
    runScanner(true);
  };

  // Start AI session via the session manager (multi-stock support)
  const handleStartAI = useCallback((symbol) => {
    startSession(symbol);
    onStartAI(symbol);
  }, [startSession, onStartAI]);

  // Stop a specific session from the overview panel
  const handleStopSessionFromOverview = useCallback(async (symbol) => {
    const sessionData = await stopSession(symbol);
    if (sessionData) {
      setSelectedSession(sessionData);
    }
  }, [stopSession]);

  // Stop all sessions
  const handleStopAll = useCallback(async () => {
    const results = await stopAllSessions();
    // Show the last session's summary
    if (results.length > 0) {
      setSelectedSession(results[results.length - 1]);
    }
  }, [stopAllSessions]);

  // View a specific session workspace
  const handleViewSession = useCallback((symbol) => {
    onStartAI(symbol);
  }, [onStartAI]);

  // If activeSymbol is present, render the dedicated workspace view
  // The workspace now observes the background session via useAISession hook
  if (activeSymbol) {
    return (
      <AIIntradayWorkspace
        symbol={activeSymbol}
        onBack={onBackToDashboard}
        onSelectSymbol={handleViewSession}
      />
    );
  }

  return (
    <div className="ai-intraday-page">
      {/* Dashboard Header */}
      <AIIntradayHeader
        aiState={aiState}
        onRefresh={handleRefresh}
        isRefreshing={isLoading}
        activeSessionCount={activeCount}
      />

      {/* Market Context Ticker Bar (NIFTY 50, BANK NIFTY, SENSEX) */}
      {displayMarketContext?.indices && (
        <div
          className="mb-16"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            flexWrap: 'wrap',
          }}
        >
          {displayMarketContext.indices.map((idx) => {
            const isUp = idx.changePct >= 0;
            return (
              <span
                key={idx.symbol}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '16px',
                  background: isUp ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid ${isUp ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                  fontSize: '0.78rem',
                  fontWeight: '700',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>{idx.name}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: '800' }}>
                  {typeof idx.price === 'number' ? idx.price.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : idx.price}
                </span>
                {isUp ? <TrendingUp size={12} color="#10B981" /> : <TrendingDown size={12} color="#EF4444" />}
                <span style={{ color: isUp ? '#10B981' : '#EF4444', fontWeight: '700' }}>
                  {isUp ? '+' : ''}{typeof idx.changePct === 'number' ? idx.changePct.toFixed(2) : idx.changePct}%
                </span>
              </span>
            );
          })}

          {/* Market Regime Badge */}
          {displayMarketContext.regime && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border)',
                fontSize: '0.76rem',
                fontWeight: '700',
                color: 'var(--text-secondary)',
                marginLeft: 'auto',
              }}
              title={displayMarketContext.regime.description}
            >
              🌐 Market: <strong style={{ color: 'var(--text-primary)' }}>{displayMarketContext.regime.label}</strong>
            </span>
          )}
        </div>
      )}

      {/* Multi-AI Session Overview Panel (only visible when sessions are running) */}
      <MultiAIOverviewPanel
        sessions={sessions}
        account={paperAccount}
        activeCount={activeCount}
        onViewSession={handleViewSession}
        onStopSession={handleStopSessionFromOverview}
        onStopAll={handleStopAll}
      />

      {/* Top Overview Metrics (6 cards) */}
      <AIIntradayStats
        marketStatus={marketStatus}
        aiStatus={aiState}
        paperBalance={paperAccount.accountValue || paperAccount.availableCash || 100000}
        todayPnL={paperAccount.dailyPnL || 0}
        todayTrades={(paperAccount.closedPositions?.length || 0) + (paperAccount.activePosition ? 1 : 0)}
        activePositions={activeCount}
        marketStatusNote={marketStatusNote}
        onAiStateChange={(newState) => setAiState(newState)}
      />

      {/* Top 10 AI Intraday Opportunities Table */}
      <IntradayOpportunityTable
        opportunities={opportunities}
        isLoading={isLoading}
        lastAnalysed={lastAnalysed}
        marketStatus={marketStatus}
        dataSource={dataSource}
        isFallback={isFallback}
        error={error}
        onRefresh={handleRefresh}
        onStartAI={handleStartAI}
        activeSessions={sessions}
      />

      {/* Past AI Trading Sessions Journal */}
      <AIPastSessionsList
        userId={user?.id}
        onSelectSession={(session) => setSelectedSession(session)}
      />

      {/* Historical Session Overview & Journal Modal */}
      <AISessionOverviewModal
        isOpen={!!selectedSession}
        onClose={() => setSelectedSession(null)}
        session={selectedSession}
      />

      {/* Mandatory AI Intraday Paper Trading Disclaimer (Part 10) */}
      <div style={{
        marginTop: '24px',
        padding: '12px 18px',
        borderRadius: '8px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '0.74rem',
        color: 'var(--text-muted)',
      }}>
        <AlertCircle size={15} color="#F59E0B" style={{ flexShrink: 0 }} />
        <span>
          <strong>Paper Trading Disclaimer:</strong> AI-generated trading decisions are experimental and intended for paper trading/testing. Trading strategies can generate losses and past performance does not guarantee future results. This feature does not connect to any live brokerage.
        </span>
      </div>
    </div>
  );
}
