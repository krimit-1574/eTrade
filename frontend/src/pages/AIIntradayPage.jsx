import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import AIIntradayHeader from '../components/ai-intraday/AIIntradayHeader';
import AIIntradayStats from '../components/ai-intraday/AIIntradayStats';
import IntradayOpportunityTable from '../components/ai-intraday/IntradayOpportunityTable';
import AIIntradayWorkspace from '../components/ai-intraday/AIIntradayWorkspace';
import AIPastSessionsList from '../components/ai-intraday/AIPastSessionsList';
import AISessionOverviewModal from '../components/ai-intraday/AISessionOverviewModal';
import { IntradayScanner } from '../services/IntradayScanner';
import { MarketContextService } from '../services/TechnicalAnalysis/MarketContextService';
import { PaperTradingAccount } from '../services/TechnicalAnalysis/PaperTradingAccount';

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
  const [marketContext, setMarketContext] = useState(null);
  const [paperAccount, setPaperAccount] = useState(() => PaperTradingAccount.load());

  // Fetch market context (NIFTY, BANK NIFTY, SENSEX)
  useEffect(() => {
    if (!activeSymbol) {
      MarketContextService.fetchMarketIndices()
        .then(res => setMarketContext(res))
        .catch(err => console.warn('AIIntradayPage: market context fetch error:', err));
    }
  }, [activeSymbol]);

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

  // If activeSymbol is present, render the dedicated /ai-intraday/:symbol workspace view
  if (activeSymbol) {
    return (
      <AIIntradayWorkspace
        symbol={activeSymbol}
        onBack={onBackToDashboard}
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
      />

      {/* Market Context Ticker Bar (NIFTY 50, BANK NIFTY, SENSEX) */}
      {marketContext?.indices && (
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
          {marketContext.indices.map((idx) => {
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
          {marketContext.regime && (
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
              title={marketContext.regime.description}
            >
              🌐 Market: <strong style={{ color: 'var(--text-primary)' }}>{marketContext.regime.label}</strong>
            </span>
          )}
        </div>
      )}

      {/* Top Overview Metrics (6 cards) */}
      <AIIntradayStats
        marketStatus={marketStatus}
        aiStatus={aiState}
        paperBalance={paperAccount.accountValue || paperAccount.availableCash || 100000}
        todayPnL={paperAccount.dailyPnL || 0}
        todayTrades={(paperAccount.closedPositions?.length || 0) + (paperAccount.activePosition ? 1 : 0)}
        activePositions={paperAccount.activePosition ? 1 : 0}
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
        onStartAI={onStartAI}
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

