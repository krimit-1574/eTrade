import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ArrowLeft, StopCircle, RefreshCw, AlertCircle,
  TrendingUp, TrendingDown, Clock, ShieldCheck, Activity, BarChart2,
  FileText, Award, Minimize2, LayoutGrid, Monitor
} from 'lucide-react';
import AIStatusBadge from './AIStatusBadge';
import AIBiasBadge from './AIBiasBadge';
import AIIntradayChart from './AIIntradayChart';
import AIIntradayAnalysisPanel from './AIIntradayAnalysisPanel';
import AIIntradayPositionPanel from './AIIntradayPositionPanel';
import AIIntradayTradePlanPanel from './AIIntradayTradePlanPanel';
import AIIntradayTimelinePanel from './AIIntradayTimelinePanel';
import MultiStockWorkspaceGrid from './MultiStockWorkspaceGrid';
import { useAISessionManager, useAISession } from '../../hooks/useAISessionManager';
import { PaperTradingAccount } from '../../services/TechnicalAnalysis/PaperTradingAccount';
import { RiskEngine } from '../../services/TechnicalAnalysis/RiskEngine';
import { SessionJournalService } from '../../services/TechnicalAnalysis/SessionJournalService';
import { MarketContextService } from '../../services/TechnicalAnalysis/MarketContextService';
import AIIntradayRiskBar from './AIIntradayRiskBar';
import AIIntradayRiskSettingsModal from './AIIntradayRiskSettingsModal';
import AISessionOverviewModal from './AISessionOverviewModal';

const TIMEFRAME_CONFIG = {
  '1m': { period: '1d', interval: '1m' },
  '3m': { period: '1d', interval: '3m' },
  '5m': { period: '5d', interval: '5m' },
  '15m': { period: '5d', interval: '15m' },
  '30m': { period: '1mo', interval: '30m' },
};

function getIndianMarketState() {
  const now = new Date();
  // Convert to IST (UTC + 5:30)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istTime = new Date(utc + (3600000 * 5.5));

  const day = istTime.getDay(); // 0 = Sun, 6 = Sat
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const timeNum = hours * 100 + minutes;

  // Weekend
  if (day === 0 || day === 6) {
    return { status: 'MARKET CLOSED', color: 'var(--red)', isLive: false, note: 'Weekend Session Closed' };
  }

  // Pre-market: 09:00 - 09:15 IST
  if (timeNum >= 900 && timeNum < 915) {
    return { status: 'PRE-MARKET', color: '#F59E0B', isLive: true, note: 'Pre-Market Discovery (09:00-09:15 IST)' };
  }

  // Market Hours: 09:15 - 15:30 IST
  if (timeNum >= 915 && timeNum <= 1530) {
    return { status: 'MARKET OPEN', color: 'var(--green)', isLive: true, note: 'Live Trading Session (09:15-15:30 IST)' };
  }

  // Post-market / After Hours
  return { status: 'MARKET CLOSED', color: 'var(--red)', isLive: false, note: 'Regular Session Closed (09:15-15:30 IST)' };
}

export default function AIIntradayWorkspace({ symbol, userId, onBack, onSelectSymbol }) {
  const cleanSymbol = (symbol || 'RELIANCE').toUpperCase().replace('.NS', '');
  const formattedSymbol = cleanSymbol.includes('.') ? cleanSymbol : `${cleanSymbol}.NS`;

  // Multi-session hooks and view state
  const {
    sessions,
    activeCount,
    startSession,
    stopSession: stopSessionInManager,
    account: managerAccount,
    marketContext,
    updateRiskSettings,
  } = useAISessionManager(userId);
  const {
    session,
    isActive,
    chartData: sessionChartData,
    markers: sessionMarkersFromHook,
    timeline: sessionTimeline,
    tradeLevels: sessionTradeLevels,
    technicalAnalysis: sessionTechnicalAnalysis,
    tradeDecision: sessionTradeDecision,
    isStaleData: sessionIsStaleData,
    stopSession,
    closePosition,
    changeTimeframe,
    refreshSession,
  } = useAISession(cleanSymbol, userId);

  const [viewMode, setViewMode] = useState('FOCUS'); // 'FOCUS' or 'MULTI_GRID'
  const marketState = getIndianMarketState();

  // Dynamically derived stock info — updates whenever symbol or session changes (no stale useState!)
  const stockInfo = useMemo(() => ({
    sym: cleanSymbol,
    ticker: formattedSymbol,
    name: `${cleanSymbol} (NSE India)`,
    price: session?.price || 0,
    change: session?.change || 0,
    changePct: session?.changePct || 0,
    marketStatus: marketState.status,
  }), [cleanSymbol, formattedSymbol, session?.price, session?.change, session?.changePct, marketState.status]);

  const [timeframe, setTimeframe] = useState(() => session?.timeframe || '5m');
  const currentTimeframe = session?.timeframe || timeframe;

  const [riskSettings, setRiskSettings] = useState(() => RiskEngine.loadSettings());
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);

  // Session Journaling & Overview Modal
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [currentSessionData, setCurrentSessionData] = useState(null);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Authoritative paper account from AISessionManager
  const account = managerAccount || PaperTradingAccount.load();
  const currentPosition = (account?.activePositions || []).find(p => p.symbol === cleanSymbol) ||
    (account?.activePosition?.symbol === cleanSymbol ? account.activePosition : null);

  const chartData = sessionChartData || session?.chartData || [];
  const isChartLoading = chartData.length === 0 && isActive;
  const aiStatus = session?.status || (isActive ? 'RUNNING' : 'STOPPED');
  const isStaleData = sessionIsStaleData || session?.isStaleData || false;
  const technicalAnalysis = sessionTechnicalAnalysis || session?.technicalAnalysis || null;
  const tradeDecision = sessionTradeDecision || session?.tradeDecision || null;
  const timelineEvents = sessionTimeline || session?.timeline || [];
  const markers = sessionMarkersFromHook || session?.markers || [];
  const tradeLevels = sessionTradeLevels || session?.tradeLevels || null;
  const sectorInfo = useMemo(
    () => MarketContextService.getSectorForStock(cleanSymbol),
    [cleanSymbol],
  );
  const calculatedSizing = useMemo(() => {
    if (!tradeDecision || tradeDecision.decision === 'WAIT' || !tradeDecision.entry || !tradeDecision.stopLoss) {
      return null;
    }
    return RiskEngine.calculatePositionSize({
      accountValue: account.accountValue,
      availableCash: account.availableCash,
      entryPrice: tradeDecision.entry,
      stopLoss: tradeDecision.stopLoss,
      settings: riskSettings,
      currentExposure: account.usedCapital,
    });
  }, [tradeDecision, account.accountValue, account.availableCash, account.usedCapital, riskSettings]);

  // Auto-start background session if not already created
  const startedRef = useRef(new Set());
  useEffect(() => {
    if (!sessions[cleanSymbol] && !startedRef.current.has(cleanSymbol)) {
      startedRef.current.add(cleanSymbol);
      startSession(cleanSymbol, { timeframe: currentTimeframe });
    }
  }, [cleanSymbol, sessions, startSession, currentTimeframe]);

  const handleTimeframeChange = (newTf) => {
    setTimeframe(newTf);
    changeTimeframe(newTf);
  };

  const handleClosePosition = useCallback(() => {
    closePosition();
  }, [closePosition]);

  const handleStopAI = async () => {
    const sessionData = await stopSession();
    if (sessionData) {
      setCurrentSessionData(sessionData);
      setIsSessionModalOpen(true);
    }
  };

  const handleOpenSessionModal = () => {
    const sessionPayload = SessionJournalService.buildSessionPayload({
      account,
      symbol: cleanSymbol,
      decisions: session?.decisions || [],
      userId: session?.userId || userId,
      sessionId: session?.id,
      startTime: session?.startedAt,
    });
    setCurrentSessionData(sessionPayload);
    setIsSessionModalOpen(true);
  };

  const handleSync = async () => {
    setIsRefreshing(true);
    try {
      await refreshSession();
    } catch (err) {
      console.warn('Workspace sync failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const isPositive = stockInfo.changePct >= 0;

  return (
    <div className="ai-intraday-workspace">
      {/* Top Breadcrumb & Route Notice */}
      <div className="flex-between mb-16" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={16} /> Back to AI Intraday Dashboard
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Route: <code style={{ color: 'var(--neon-cyan)' }}>/ai-intraday/{stockInfo.sym}</code>
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleSync}
            disabled={isRefreshing}
            title="Refresh chart and market stream"
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin-anim' : ''} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* Multi-Stock Session Tabs Bar — shows all active AI sessions */}
      {activeCount > 1 && (
        <div
          className="mb-16"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            flexWrap: 'wrap',
          }}
        >
          {/* Stock Tabs */}
          {Object.values(sessions)
            .filter(s => s.isActive)
            .map((s) => {
              const isCurrentTab = s.symbol === cleanSymbol;
              const tabPnl = s.positionSummary?.unrealizedPnL || 0;
              const tabChangePct = s.changePct || 0;
              const tabIsUp = tabChangePct >= 0;
              return (
                <button
                  key={s.symbol}
                  onClick={() => onSelectSymbol && onSelectSymbol(s.symbol)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 14px',
                    borderRadius: '8px',
                    background: isCurrentTab ? 'rgba(0, 240, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: isCurrentTab ? '1px solid rgba(0, 240, 255, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isCurrentTab ? '#00F0FF' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: isCurrentTab ? '800' : '600',
                    transition: 'all 0.2s',
                    letterSpacing: '0.3px',
                  }}
                  title={`Switch to ${s.symbol} workspace`}
                >
                  {/* Session status dot */}
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: s.hasPosition ? '#F59E0B' : (s.status === 'RUNNING' ? '#10B981' : '#64748B'),
                      boxShadow: s.hasPosition ? '0 0 6px #F59E0B' : 'none',
                    }}
                  />
                  <span style={{ fontWeight: '800' }}>{s.symbol}</span>
                  <span style={{ color: tabIsUp ? '#10B981' : '#EF4444', fontSize: '0.7rem' }}>
                    {tabIsUp ? '+' : ''}{tabChangePct.toFixed(1)}%
                  </span>
                  {s.hasPosition && tabPnl !== 0 && (
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: '700',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: tabPnl >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      color: tabPnl >= 0 ? '#10B981' : '#EF4444',
                    }}>
                      {tabPnl >= 0 ? '+' : ''}₹{tabPnl.toFixed(0)}
                    </span>
                  )}
                </button>
              );
            })}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* View Mode Toggle (Focus / Grid) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '3px' }}>
            <button
              onClick={() => setViewMode('FOCUS')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: '6px',
                background: viewMode === 'FOCUS' ? 'rgba(0, 240, 255, 0.12)' : 'transparent',
                border: viewMode === 'FOCUS' ? '1px solid rgba(0, 240, 255, 0.25)' : '1px solid transparent',
                color: viewMode === 'FOCUS' ? '#00F0FF' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: '700',
                transition: 'all 0.2s',
              }}
              title="Focus on single stock workspace"
            >
              <Monitor size={13} /> Focus
            </button>
            <button
              onClick={() => setViewMode('MULTI_GRID')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: '6px',
                background: viewMode === 'MULTI_GRID' ? 'rgba(0, 240, 255, 0.12)' : 'transparent',
                border: viewMode === 'MULTI_GRID' ? '1px solid rgba(0, 240, 255, 0.25)' : '1px solid transparent',
                color: viewMode === 'MULTI_GRID' ? '#00F0FF' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: '700',
                transition: 'all 0.2s',
              }}
              title="Multi-stock split-screen grid"
            >
              <LayoutGrid size={13} /> Grid ({activeCount})
            </button>
          </div>
        </div>
      )}

      {/* Multi-Stock Grid View (replaces single-stock focus when toggled) */}
      {viewMode === 'MULTI_GRID' && activeCount > 1 ? (
        <MultiStockWorkspaceGrid
          sessions={sessions}
          onExpandSession={(sym) => {
            setViewMode('FOCUS');
            if (onSelectSymbol) onSelectSymbol(sym);
          }}
          onStopSession={async (sym) => {
            await stopSessionInManager(sym);
          }}
          onMinimizeSession={() => { }}
        />
      ) : (
        <>
          {/* Main Stock Header Card */}
          <div className="card card-accent-gold mb-20" style={{ padding: '20px 24px' }}>
            <div className="flex-between" style={{ flexWrap: 'wrap', gap: '16px' }}>
              {/* Left: Symbol, Name, Badges */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: '2rem', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
                    {stockInfo.sym}
                  </h1>

                  {/* Actual Market State Badge (OPEN / CLOSED / PRE-MARKET) */}
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: '800',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      background: marketState.status === 'MARKET OPEN' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: `1px solid ${marketState.status === 'MARKET OPEN' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      color: marketState.color,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                    }}
                    title={marketState.note}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: marketState.color,
                        boxShadow: `0 0 6px ${marketState.color}`,
                      }}
                    />
                    {marketState.status}
                  </span>

                  {/* PAPER TRADING Badge */}
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: '800',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      color: '#F59E0B',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      letterSpacing: '0.5px',
                    }}
                  >
                    📝 PAPER TRADING
                  </span>

                  {/* Sector Benchmark Badge */}
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: '#818CF8',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title={`Sector Index: ${sectorInfo.name}`}
                  >
                    📊 {sectorInfo.name}
                  </span>

                  {/* General Market Regime Badge */}
                  {marketContext?.regime && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title={`Benchmark Context: ${marketContext.regime.description}`}
                    >
                      🌐 MKT: {marketContext.regime.label}
                    </span>
                  )}

                  <AIBiasBadge bias={tradeDecision ? (tradeDecision.direction === 'LONG' ? 'LONG' : (tradeDecision.direction === 'SHORT' ? 'SHORT' : 'WAIT')) : 'WAIT'} size="md" />
                  <AIStatusBadge state={aiStatus} size="md" />

                  {/* Data Stream Connection Badge */}
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      padding: '3px 10px',
                      borderRadius: '12px',
                      background: isStaleData ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${isStaleData ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'}`,
                      color: isStaleData ? '#EF4444' : 'var(--text-secondary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Activity size={12} style={{ color: isStaleData ? '#EF4444' : 'var(--green)' }} />
                    {isStaleData ? 'STREAM STALE' : 'FEED CONNECTED'}
                  </span>
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {stockInfo.name} • High-Frequency Intraday AI Trading Room
                </p>
              </div>

              {/* Right: Live Price & STOP AI Action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.85rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {stockInfo.price > 0
                      ? `₹${stockInfo.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : 'Fetching Price...'}
                  </div>
                  <div
                    style={{
                      color: isPositive ? 'var(--green)' : 'var(--red)',
                      fontWeight: '700',
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '4px',
                    }}
                  >
                    {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {isPositive ? '+' : ''}{stockInfo.change.toFixed(2)} ({isPositive ? '+' : ''}{stockInfo.changePct.toFixed(2)}%)
                  </div>
                </div>

                {/* Actions: Minimize, Session Report & STOP AI */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn btn-ghost"
                    onClick={onBack}
                    style={{
                      padding: '9px 14px',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      letterSpacing: '0.3px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-secondary)',
                    }}
                    title="Minimize workspace — AI session continues running in background"
                  >
                    <Minimize2 size={15} />
                    <span>Minimize</span>
                  </button>

                  <button
                    className="btn btn-ghost"
                    onClick={handleOpenSessionModal}
                    style={{
                      padding: '9px 14px',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      letterSpacing: '0.3px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-primary)',
                    }}
                    title="View session analytics, trade journal, and retrospective"
                  >
                    <FileText size={15} color="var(--neon-gold, #F59E0B)" />
                    <span>Session Report</span>
                  </button>

                  <button
                    className="btn btn-danger"
                    onClick={handleStopAI}
                    style={{
                      padding: '10px 18px',
                      fontSize: '0.85rem',
                      fontWeight: '800',
                      letterSpacing: '0.5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    title="Stop AI monitoring, save session journal, and exit"
                  >
                    <StopCircle size={18} />
                    <span>STOP AI</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Stale Data / Disconnect Warning Banner with Reconnect Action */}
          {isStaleData && (
            <div
              className="mb-16"
              style={{
                padding: '12px 18px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '0.84rem',
                color: '#EF4444',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} />
                <span>
                  <strong>Data Warning:</strong> Live price/candle stream is disconnected or stale. New trade entries paused. Risk protections remain active.
                </span>
              </div>
              <button
                className="btn btn-sm btn-ghost"
                onClick={handleSync}
                disabled={isRefreshing}
                style={{ border: '1px solid rgba(239, 68, 68, 0.4)', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={13} className={isRefreshing ? 'spin-anim' : ''} />
                <span>{isRefreshing ? 'Reconnecting...' : 'Reconnect'}</span>
              </button>
            </div>
          )}

          {/* Intraday Risk Management Monitor Strip */}
          <AIIntradayRiskBar
            account={account}
            riskSettings={riskSettings}
            calculatedSizing={calculatedSizing}
            onOpenSettings={() => setIsRiskModalOpen(true)}
          />

          {/* Candlestick Chart */}
          <div className="mb-24">
            <AIIntradayChart
              data={chartData}
              isLoading={isChartLoading}
              activeTimeframe={currentTimeframe}
              onTimeframeChange={handleTimeframeChange}
              markers={markers}
              tradeLevels={tradeLevels}
            />
          </div>

          {/* 4 Bottom Panels in Grid Layout */}
          <div className="grid-2 mb-24" style={{ gap: '20px' }}>
            {/* Panel 1: AI Trade Analysis */}
            <AIIntradayAnalysisPanel
              stockData={stockInfo}
              aiStatus={aiStatus}
              bias={technicalAnalysis ? (technicalAnalysis.setupStrength >= 60 ? 'LONG' : (technicalAnalysis.setupStrength <= 40 ? 'SHORT' : 'WAIT')) : 'WAIT'}
              aiScore={technicalAnalysis ? technicalAnalysis.setupStrength : 50}
              aiConfidence={technicalAnalysis ? Math.min(99, Math.max(45, technicalAnalysis.setupStrength + 10)) : 50}
              analysisData={technicalAnalysis}
            />

            {/* Panel 2: Current Position */}
            <AIIntradayPositionPanel
              position={currentPosition}
              account={account}
              onClosePosition={handleClosePosition}
            />

            {/* Panel 3: Trade Plan */}
            <AIIntradayTradePlanPanel tradeDecision={tradeDecision} />

            {/* Panel 4: Trade Timeline */}
            <AIIntradayTimelinePanel
              symbol={stockInfo.sym}
              sessionTime={session?.startedAt ? new Date(session.startedAt).toLocaleTimeString('en-US', { hour12: true }) : ''}
              events={timelineEvents}
            />
          </div>

          {/* Risk Engine Settings Modal */}
          <AIIntradayRiskSettingsModal
            isOpen={isRiskModalOpen}
            onClose={() => setIsRiskModalOpen(false)}
            currentSettings={riskSettings}
            onSave={(newSettings) => {
              const saved = RiskEngine.saveSettings(newSettings);
              setRiskSettings(saved);
              updateRiskSettings(saved);
            }}
            onReset={() => {
              const defaults = RiskEngine.resetSettings();
              setRiskSettings(defaults);
              updateRiskSettings(defaults);
            }}
          />

          {/* Session Overview / Journal Modal (Part 9) */}
          <AISessionOverviewModal
            isOpen={isSessionModalOpen}
            onClose={() => {
              setIsSessionModalOpen(false);
              if (aiStatus === 'STOPPED' && onBack) {
                onBack();
              }
            }}
            session={currentSessionData}
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
              <strong>Paper Trading Disclaimer:</strong> AI-generated trading decisions are experimental and intended for paper trading/testing. Trading strategies can generate losses and past performance does not guarantee future results.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
