import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  ArrowLeft, StopCircle, RefreshCw, AlertCircle, 
  TrendingUp, TrendingDown, Clock, ShieldCheck, Activity, BarChart2,
  FileText, Award
} from 'lucide-react';
import { api } from '../../api';
import AIStatusBadge from './AIStatusBadge';
import AIBiasBadge from './AIBiasBadge';
import AIIntradayChart from './AIIntradayChart';
import AIIntradayAnalysisPanel from './AIIntradayAnalysisPanel';
import AIIntradayPositionPanel from './AIIntradayPositionPanel';
import AIIntradayTradePlanPanel from './AIIntradayTradePlanPanel';
import AIIntradayTimelinePanel from './AIIntradayTimelinePanel';
import { SetupAnalyzer } from '../../services/TechnicalAnalysis/SetupAnalyzer';
import { AITradingDecisionEngine } from '../../services/TechnicalAnalysis/AITradingDecisionEngine';
import { StrategyConfig } from '../../services/TechnicalAnalysis/StrategyConfig';
import { PaperTradingAccount } from '../../services/TechnicalAnalysis/PaperTradingAccount';
import { PaperBroker } from '../../services/TechnicalAnalysis/PaperBroker';
import { RiskEngine } from '../../services/TechnicalAnalysis/RiskEngine';
import { PositionManager, POSITION_DECISION } from '../../services/TechnicalAnalysis/PositionManager';
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

export default function AIIntradayWorkspace({ symbol, onBack }) {
  const cleanSymbol = (symbol || 'RELIANCE').toUpperCase();
  const formattedSymbol = cleanSymbol.includes('.') ? cleanSymbol : `${cleanSymbol}.NS`;

  const marketState = getIndianMarketState();

  const [stockInfo, setStockInfo] = useState({
    sym: cleanSymbol.replace('.NS', ''),
    ticker: formattedSymbol,
    name: `${cleanSymbol.replace('.NS', '')} (NSE India)`,
    price: 0,
    change: 0,
    changePct: 0,
    marketStatus: marketState.status,
  });

  const [timeframe, setTimeframe] = useState('5m');
  const [chartData, setChartData] = useState([]);
  const [isChartLoading, setIsChartLoading] = useState(true);
  const [aiStatus, setAiStatus] = useState('MONITORING');
  const [sessionStartTime] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: true }));
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [technicalAnalysis, setTechnicalAnalysis] = useState(null);
  const [tradeDecision, setTradeDecision] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([
    {
      id: 1,
      time: sessionStartTime,
      title: 'AI session opened',
      detail: `Initialized dedicated intraday trading workspace for ${cleanSymbol}.`,
      type: 'info',
    }
  ]);

  // Paper Trading State (Persisted in sessionStorage)
  const [paperAccount, setPaperAccount] = useState(() => PaperTradingAccount.load());
  const hasExecutedRef = useRef(false);

  // Risk Management Settings & Modal
  const [riskSettings, setRiskSettings] = useState(() => RiskEngine.loadSettings());
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);

  // Trade Markers History for Chart Overlay
  const [sessionMarkers, setSessionMarkers] = useState([]);

  // Session Journaling & Overview Modal (Part 9)
  const sessionDecisionsRef = useRef([]);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [currentSessionData, setCurrentSessionData] = useState(null);

  // Market & Sector Context & Stale Data Guards (Part 10)
  const [marketContext, setMarketContext] = useState(null);
  const [isStaleData, setIsStaleData] = useState(false);
  const sectorInfo = useMemo(() => MarketContextService.getSectorForStock(cleanSymbol), [cleanSymbol]);

  const isMounted = useRef(true);
  const pollingTimerRef = useRef(null);

  // Load benchmark market indices context
  useEffect(() => {
    MarketContextService.fetchMarketIndices().then(res => {
      if (isMounted.current && res) setMarketContext(res);
    }).catch(err => console.warn('Workspace: market context load error:', err));
  }, []);

  // Fetch Live Price & Metadata
  const fetchLiveQuote = useCallback(async () => {
    try {
      const res = await api.getPrice(formattedSymbol);
      if (res && res.price !== 'N/A' && isMounted.current) {
        setIsStaleData(false);
        setStockInfo((prev) => ({
          ...prev,
          price: parseFloat(res.price || 0),
          change: parseFloat(res.change || 0),
          changePct: parseFloat(res.pct || 0),
        }));
      } else if (isMounted.current) {
        setIsStaleData(true);
      }
    } catch (err) {
      console.warn('Workspace: fetchLiveQuote error:', err);
      if (isMounted.current) setIsStaleData(true);
    }
  }, [formattedSymbol]);

  // Fetch OHLCV Candlestick History
  const fetchCandleData = useCallback(async (selectedTf = timeframe, force = false) => {
    if (force) setIsRefreshing(true);
    else setIsChartLoading(true);
    setError(null);

    try {
      const config = TIMEFRAME_CONFIG[selectedTf] || TIMEFRAME_CONFIG['5m'];
      const res = await api.getHistory(formattedSymbol, config.period, config.interval);

      if (isMounted.current) {
        if (res && Array.isArray(res.data) && res.data.length > 0) {
          setChartData(res.data);
          // Run analysis engine with market context (Part 10)
          const analysis = SetupAnalyzer.analyze(stockInfo.sym, res.data, marketContext);
          setTechnicalAnalysis(analysis);
          setIsStaleData(false);
        } else {
          // If 1m is empty (off-hours), fallback to 5m/15m
          const fallbackRes = await api.getHistory(formattedSymbol, '5d', '15m');
          if (fallbackRes && Array.isArray(fallbackRes.data)) {
            setChartData(fallbackRes.data);
            const fallbackAnalysis = SetupAnalyzer.analyze(stockInfo.sym, fallbackRes.data, marketContext);
            setTechnicalAnalysis(fallbackAnalysis);
            setIsStaleData(false);
          }
        }
      }
    } catch (err) {
      console.error('Workspace: fetchCandleData error:', err);
      if (isMounted.current) {
        setError('Unable to retrieve intraday candle stream. Showing latest cached session.');
        setIsStaleData(true);
      }
    } finally {
      if (isMounted.current) {
        setIsChartLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [formattedSymbol, timeframe, marketContext]);

  useEffect(() => {
    isMounted.current = true;
    fetchLiveQuote();
    fetchCandleData(timeframe);

    // Light polling every 10 seconds for intraday price updates
    pollingTimerRef.current = setInterval(() => {
      fetchLiveQuote();
    }, 10000);

    return () => {
      isMounted.current = false;
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [fetchLiveQuote, fetchCandleData, timeframe]);

  // Evaluate Trading Decision when analysis or price changes
  useEffect(() => {
    if (technicalAnalysis && stockInfo.price > 0 && isMounted.current) {
      try {
        const decision = AITradingDecisionEngine.evaluate(technicalAnalysis, stockInfo.price, marketContext);
        setTradeDecision(decision);

        // Update AI Status based on decision and state (Part 10 State Matrix)
        if (paperAccount.activePosition) {
          setAiStatus('POSITION ACTIVE');
        } else if (isStaleData || error) {
          setAiStatus('DATA DISCONNECTED');
        } else if (decision.decision === 'BUY' || decision.decision === 'SHORT') {
          setAiStatus('RUNNING');
        } else if (decision.invalidation && decision.invalidation.includes('waiting')) {
          setAiStatus('WAITING FOR CONFIRMATION');
        } else {
          setAiStatus('WAITING');
        }

        // Add timeline event if setup is found
        if (decision.decision !== 'WAIT') {
          setTimelineEvents(prev => {
            const lastEvent = prev[prev.length - 1];
            if (lastEvent && lastEvent.title.includes(decision.decision)) return prev;

            return [...prev, {
              id: Date.now(),
              time: new Date().toLocaleTimeString('en-US', { hour12: true }),
              title: `${decision.decision} Setup Validated`,
              detail: `Detected ${decision.setup.replace(/_/g, ' ')}. Confidence: ${decision.confidence}%. Entry: ₹${decision.entry}.`,
              type: 'active'
            }];
          });
        }

        // MANDATORY RISK ENGINE VETO GATE
        // The AI Strategy Engine CANNOT bypass the Risk Engine
        if ((decision.decision === 'BUY' || decision.decision === 'SHORT') && !paperAccount.activePosition && !hasExecutedRef.current) {
          hasExecutedRef.current = true;

          // Stale Data Guard (Rule 16 / Task 6)
          if (isStaleData || error) {
            setTimelineEvents(prev => [...prev, {
              id: Date.now(),
              time: new Date().toLocaleTimeString('en-US', { hour12: true }),
              title: 'Trade Blocked: Stale Data / Disconnected',
              detail: 'Market connection has an active error or stale quote. Order creation prevented. [STALE_DATA]',
              type: 'error',
            }]);
            setAiStatus('DATA DISCONNECTED');
            return;
          }

          const validation = RiskEngine.validateTrade({
            account: paperAccount,
            decision,
            stockInfo,
            customSettings: riskSettings,
          });

          // Record major AI decision for session journaling (Part 9)
          sessionDecisionsRef.current.push({
            decision: decision.decision,
            direction: decision.direction,
            setup: decision.setup,
            confidence: decision.confidence,
            entry: decision.entry,
            stopLoss: decision.stopLoss,
            target1: decision.target1,
            target2: decision.target2,
            price: stockInfo.price,
            timestamp: new Date().toISOString(),
            accepted: validation.approved,
            rejectionReason: validation.approved ? null : `${validation.reason} [${validation.code}]`,
          });

          if (!validation.approved) {
            // Trade VETOED by Risk Engine
            setTimelineEvents(prev => [...prev, {
              id: Date.now(),
              time: new Date().toLocaleTimeString('en-US', { hour12: true }),
              title: 'Trade Rejected by Risk Engine',
              detail: `Reason: ${validation.reason} [${validation.code}]`,
              type: 'error',
            }]);
            setAiStatus('RISK LIMIT REACHED');
            return;
          }

        // Approved: Execute with Risk-Engine calculated position sizing
        const { account: updatedAccount, events: orderEvents } = PaperBroker.executeMarketOrder(paperAccount, {
          symbol: stockInfo.sym,
          direction: decision.direction,
          entry: decision.entry,
          stopLoss: decision.stopLoss,
          target1: decision.target1,
          target2: decision.target2,
          setup: decision.setup,
          confidence: decision.confidence,
          customQuantity: validation.quantity,
        });

        // Record initial BUY/SHORT entry marker on chart
        const latestCandle = chartData[chartData.length - 1];
        const candleTime = latestCandle?.time || latestCandle?.date;
        if (candleTime && updatedAccount.activePosition) {
          setSessionMarkers(prev => [...prev, {
            time: candleTime,
            position: decision.direction === 'LONG' ? 'belowBar' : 'aboveBar',
            color: decision.direction === 'LONG' ? '#10B981' : '#EF4444',
            shape: decision.direction === 'LONG' ? 'arrowUp' : 'arrowDown',
            text: `${decision.direction === 'LONG' ? 'BUY' : 'SHORT'} @ ₹${updatedAccount.activePosition.entryPrice}`,
          }]);
        }

        setPaperAccount({ ...updatedAccount });
        setTimelineEvents(prev => [...prev, ...orderEvents]);
        setAiStatus('POSITION OPEN');
      }

      // Reset execution flag when decision goes back to WAIT
      if (decision.decision === 'WAIT') {
        hasExecutedRef.current = false;
      }
    } catch (err) {
      console.error('Workspace: DecisionEngine evaluate error:', err);
      setAiStatus('WAITING');
    }
  }
}, [technicalAnalysis, stockInfo.price, riskSettings, error, chartData, isStaleData, paperAccount.activePosition]);

  // Autonomous Position Lifecycle & Order Evaluation on each price tick / candle
  useEffect(() => {
    if (paperAccount.activePosition && stockInfo.price > 0) {
      let currentAccount = PaperTradingAccount.updateMarketPrice({ ...paperAccount }, stockInfo.price);
      const pos = currentAccount.activePosition;

      // Run PositionManager autonomous lifecycle evaluation
      const evaluation = PositionManager.evaluatePosition({
        position: pos,
        currentPrice: stockInfo.price,
        candleHigh: stockInfo.dayHigh,
        candleLow: stockInfo.dayLow,
        technicalAnalysis,
        latestDecision: tradeDecision,
        riskSettings,
      });

      const latestCandle = chartData[chartData.length - 1];
      const candleTime = latestCandle?.time || latestCandle?.date;

      if (evaluation.action === POSITION_DECISION.PARTIAL_EXIT) {
        // Take partial profit (e.g. 50% scale-out at Target 1)
        const exitResult = PaperBroker.closePosition(currentAccount, stockInfo.price, evaluation.reason, evaluation.exitQuantity);
        currentAccount = exitResult.account;
        setTimelineEvents(prev => [...prev, ...exitResult.events]);

        // Auto move stop to breakeven after partial profit taken
        const beStop = pos.direction === 'LONG' ? parseFloat((pos.entryPrice * 1.0005).toFixed(2)) : parseFloat((pos.entryPrice * 0.9995).toFixed(2));
        const beResult = PaperBroker.updateStopLoss(currentAccount, beStop, 'Stop moved to break-even');
        if (beResult.updated) {
          currentAccount = beResult.account;
          currentAccount.activePosition.breakevenMoved = true;
          setTimelineEvents(prev => [...prev, ...beResult.events]);
        }

        if (candleTime) {
          setSessionMarkers(prev => [...prev, {
            time: candleTime,
            position: pos.direction === 'LONG' ? 'aboveBar' : 'belowBar',
            color: '#F59E0B',
            shape: 'circle',
            text: `PARTIAL: ${evaluation.exitQuantity} @ ₹${exitResult.fillPrice}`,
          }]);
        }
      } else if (evaluation.action === POSITION_DECISION.MOVE_TO_BREAKEVEN) {
        // Move Stop Loss to Break-Even
        const updateResult = PaperBroker.updateStopLoss(currentAccount, evaluation.newStop, 'Stop moved to break-even');
        if (updateResult.updated) {
          currentAccount = updateResult.account;
          currentAccount.activePosition.breakevenMoved = true;
          setTimelineEvents(prev => [...prev, ...updateResult.events]);
        }
      } else if (evaluation.action === POSITION_DECISION.TRAIL_STOP) {
        // Ratchet Trailing Stop
        const updateResult = PaperBroker.updateStopLoss(currentAccount, evaluation.newStop, 'Trailing stop ratcheted');
        if (updateResult.updated) {
          currentAccount = updateResult.account;
          setTimelineEvents(prev => [...prev, ...updateResult.events]);
        }
      } else if (evaluation.action === POSITION_DECISION.TAKE_PROFIT || evaluation.action === POSITION_DECISION.EXIT) {
        // Full liquidation
        const exitResult = PaperBroker.closePosition(currentAccount, stockInfo.price, evaluation.reason);
        currentAccount = exitResult.account;
        setTimelineEvents(prev => [...prev, ...exitResult.events]);
        setAiStatus(StrategyConfig.STATUS_WAITING);

        if (candleTime) {
          const isTarget = evaluation.markerType === 'TARGET';
          const isStop = evaluation.markerType === 'STOP';
          setSessionMarkers(prev => [...prev, {
            time: candleTime,
            position: pos.direction === 'LONG' ? 'aboveBar' : 'belowBar',
            color: isTarget ? '#10B981' : (isStop ? '#EF4444' : '#64748B'),
            shape: isStop ? 'square' : 'circle',
            text: `${evaluation.markerType}: ${pos.symbol} @ ₹${exitResult.fillPrice}`,
          }]);
        }
      }

      PaperTradingAccount.save(currentAccount);
      setPaperAccount(currentAccount);
    } else if (paperAccount.pendingOrders?.length > 0 && stockInfo.price > 0) {
      // Evaluate pending limit / stop orders
      const { account: afterPending, filledOrders, events: pendingEvents } = PaperBroker.evaluatePendingOrders(
        { ...paperAccount },
        stockInfo.price,
        stockInfo.dayHigh,
        stockInfo.dayLow
      );
      if (filledOrders.length > 0) {
        setTimelineEvents(prev => [...prev, ...pendingEvents]);
        setAiStatus('POSITION OPEN');
        setPaperAccount(afterPending);
      }
    }
  }, [stockInfo.price, stockInfo.dayHigh, stockInfo.dayLow, technicalAnalysis, tradeDecision, riskSettings, chartData]);

  // Handle manual position exit from UI
  const handleClosePosition = useCallback(() => {
    if (paperAccount.activePosition && stockInfo.price > 0) {
      const { account: updated, events } = PaperBroker.closePosition(paperAccount, stockInfo.price, 'Manual exit by trader');
      setPaperAccount({ ...updated });
      setTimelineEvents(prev => [...prev, ...events]);
      setAiStatus(StrategyConfig.STATUS_WAITING);
    }
  }, [paperAccount, stockInfo.price]);

  // Chart markers for entry order
  const chartMarkers = useMemo(() => {
    const list = [];
    if (paperAccount.activePosition && chartData.length > 0) {
      const pos = paperAccount.activePosition;
      const latestCandle = chartData[chartData.length - 1];
      const candleTime = latestCandle?.time || latestCandle?.date;
      if (candleTime) {
        list.push({
          time: candleTime,
          position: pos.direction === 'LONG' ? 'belowBar' : 'aboveBar',
          color: pos.direction === 'LONG' ? '#10B981' : '#EF4444',
          shape: pos.direction === 'LONG' ? 'arrowUp' : 'arrowDown',
          text: `${pos.direction === 'LONG' ? 'BUY' : 'SHORT'} @ ₹${pos.entryPrice}`,
        });
      }
    }
    return list;
  }, [paperAccount.activePosition, chartData]);

  // Trade levels for chart overlay (Entry, SL, T1, T2)
  const tradeLevels = useMemo(() => {
    if (paperAccount.activePosition) {
      return {
        entry: paperAccount.activePosition.entryPrice,
        stopLoss: paperAccount.activePosition.stopLoss,
        target1: paperAccount.activePosition.target1,
        target2: paperAccount.activePosition.target2,
        direction: paperAccount.activePosition.direction,
      };
    }
    if (tradeDecision && tradeDecision.decision !== 'WAIT' && tradeDecision.entry) {
      return {
        entry: tradeDecision.entry,
        stopLoss: tradeDecision.stopLoss,
        target1: tradeDecision.target1,
        target2: tradeDecision.target2,
        direction: tradeDecision.direction,
      };
    }
    return null;
  }, [paperAccount.activePosition, tradeDecision]);

  const handleTimeframeChange = (newTf) => {
    setTimeframe(newTf);
    fetchCandleData(newTf);
  };

  const handleOpenSessionModal = () => {
    const session = SessionJournalService.buildSessionPayload({
      account: paperAccount,
      symbol: stockInfo.sym,
      decisions: sessionDecisionsRef.current,
      userId: 'guest',
    });
    setCurrentSessionData(session);
    setIsSessionModalOpen(true);
  };

  const handleStopAI = async () => {
    setAiStatus('STOPPED');
    isMounted.current = false;
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    let finalAccount = paperAccount;
    // If active paper position exists, close it immediately before stopping
    if (paperAccount.activePosition && stockInfo.price > 0) {
      const { account: closedAccount, events } = PaperBroker.closePosition(
        paperAccount, 
        stockInfo.price, 
        'AI session manually stopped by user.'
      );
      PaperTradingAccount.save(closedAccount);
      setPaperAccount(closedAccount);
      setTimelineEvents(prev => [...prev, ...events]);
      finalAccount = closedAccount;
    }

    // Build complete session summary and persist
    try {
      const session = SessionJournalService.buildSessionPayload({
        account: finalAccount,
        symbol: stockInfo.sym,
        decisions: sessionDecisionsRef.current,
        userId: 'guest',
      });
      setCurrentSessionData(session);
      setIsSessionModalOpen(true);
      await SessionJournalService.saveSession(session);
    } catch (err) {
      console.warn('AIIntradayWorkspace: Failed to persist session on stop', err);
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
            onClick={() => {
              fetchLiveQuote();
              fetchCandleData(timeframe, true);
            }}
            disabled={isRefreshing}
            title="Refresh chart and market stream"
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin-anim' : ''} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

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

            {/* Actions: Session Report & STOP AI */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
      {(isStaleData || error) && (
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
            onClick={() => {
              fetchLiveQuote();
              fetchCandleData(timeframe, true);
            }}
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
        account={paperAccount}
        riskSettings={riskSettings}
        calculatedSizing={useMemo(() => {
          if (tradeDecision && tradeDecision.decision !== 'WAIT' && tradeDecision.entry && tradeDecision.stopLoss) {
            return RiskEngine.calculatePositionSize({
              accountValue: paperAccount.accountValue,
              availableCash: paperAccount.availableCash,
              entryPrice: tradeDecision.entry,
              stopLoss: tradeDecision.stopLoss,
              settings: riskSettings,
            });
          }
          return null;
        }, [tradeDecision, paperAccount.accountValue, paperAccount.availableCash, riskSettings])}
        onOpenSettings={() => setIsRiskModalOpen(true)}
      />

      {/* Candlestick Chart */}
      <div className="mb-24">
        <AIIntradayChart
          data={chartData}
          isLoading={isChartLoading}
          activeTimeframe={timeframe}
          onTimeframeChange={handleTimeframeChange}
          markers={[...sessionMarkers, ...chartMarkers]}
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
          position={paperAccount.activePosition}
          account={paperAccount}
          onClosePosition={handleClosePosition}
        />

        {/* Panel 3: Trade Plan */}
        <AIIntradayTradePlanPanel tradeDecision={tradeDecision} />

        {/* Panel 4: Trade Timeline */}
        <AIIntradayTimelinePanel
          symbol={stockInfo.sym}
          sessionTime={sessionStartTime}
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
        }}
        onReset={() => {
          const defaults = RiskEngine.resetSettings();
          setRiskSettings(defaults);
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
    </div>
  );
}
