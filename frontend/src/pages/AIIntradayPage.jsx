import React, { useState, useEffect, useCallback } from 'react';
import AIIntradayHeader from '../components/ai-intraday/AIIntradayHeader';
import AIIntradayStats from '../components/ai-intraday/AIIntradayStats';
import IntradayOpportunityTable from '../components/ai-intraday/IntradayOpportunityTable';
import AIIntradayWorkspace from '../components/ai-intraday/AIIntradayWorkspace';
import AIPastSessionsList from '../components/ai-intraday/AIPastSessionsList';
import AISessionOverviewModal from '../components/ai-intraday/AISessionOverviewModal';
import { IntradayScanner } from '../services/IntradayScanner';

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

      {/* Top Overview Metrics (6 cards) */}
      <AIIntradayStats
        marketStatus={marketStatus}
        aiStatus={aiState}
        paperBalance={100000}
        todayPnL={0}
        todayTrades={0}
        activePositions={0}
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
    </div>
  );
}
