import React, { useState, useMemo } from 'react';
import {
  X, TrendingUp, TrendingDown, Award, BarChart2, FileText,
  Target, Activity, Clock, Download, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, Minus
} from 'lucide-react';
import { SessionJournalService } from '../../services/TechnicalAnalysis/SessionJournalService';
import TradeDetailsModal from './TradeDetailsModal';

// ─── Mini Equity Curve (pure CSS bars, no library dependency) ─────
function EquityCurveChart({ equityCurve }) {
  if (!equityCurve || equityCurve.length < 2) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '20px 0' }}>Insufficient data for equity curve.</div>;
  }

  const min = Math.min(...equityCurve);
  const max = Math.max(...equityCurve);
  const range = max - min || 1;
  const baseline = equityCurve[0];

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '120px', padding: '8px 0' }}>
      {equityCurve.map((val, i) => {
        const height = Math.max(4, ((val - min) / range) * 100);
        const isGain = val >= baseline;
        return (
          <div
            key={i}
            title={`₹${val.toLocaleString('en-IN')}`}
            style={{
              flex: 1,
              height: `${height}%`,
              borderRadius: '2px 2px 0 0',
              background: isGain
                ? 'linear-gradient(180deg, rgba(16,185,129,0.8), rgba(16,185,129,0.3))'
                : 'linear-gradient(180deg, rgba(239,68,68,0.8), rgba(239,68,68,0.3))',
              minWidth: '3px',
              transition: 'height 0.3s ease',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Trade Row Component ──────────────────────────────────────────
function TradeRow({ trade, index, onViewDetails }) {
  const [expanded, setExpanded] = useState(false);
  const pnl = parseFloat(trade.realizedPnL || trade.pnl || 0);
  const isWin = pnl >= 0;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.06)',
      marginBottom: '8px',
      overflow: 'hidden',
    }}>
      {/* Summary Row */}
      <div
        onClick={() => setExpanded(prev => !prev)}
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr 80px 100px 100px 40px',
          alignItems: 'center',
          padding: '12px 16px',
          cursor: 'pointer',
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>#{index + 1}</span>
        <div>
          <span style={{ fontWeight: '700', fontSize: '0.82rem' }}>{trade.symbol}</span>
          <span style={{
            marginLeft: '8px',
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '4px',
            background: trade.direction === 'LONG' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: trade.direction === 'LONG' ? '#10B981' : '#EF4444',
            fontWeight: '700',
          }}>
            {trade.direction}
          </span>
          <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {(trade.setup || '').replace(/_/g, ' ')}
          </span>
        </div>
        <span style={{ fontSize: '0.78rem', fontWeight: '600' }}>{trade.quantity} shares</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          ₹{trade.entryPrice?.toFixed(2)} → ₹{trade.exitPrice?.toFixed(2)}
        </span>
        <span style={{
          fontSize: '0.82rem',
          fontWeight: '800',
          color: isWin ? '#10B981' : '#EF4444',
          textAlign: 'right',
        }}>
          {isWin ? '+' : ''}₹{pnl.toFixed(2)}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div style={{
          padding: '0 16px 16px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
            <MetricItem label="Entry Time" value={trade.entryTime ? new Date(trade.entryTime).toLocaleString() : '—'} />
            <MetricItem label="Exit Time" value={trade.exitTime ? new Date(trade.exitTime).toLocaleString() : '—'} />
            <MetricItem label="Stop Loss" value={trade.stopLoss ? `₹${trade.stopLoss}` : '—'} />
            <MetricItem label="Target 1" value={trade.target1 ? `₹${trade.target1}` : '—'} />
            <MetricItem label="Confidence" value={trade.confidence ? `${trade.confidence}%` : '—'} />
            <MetricItem label="Exit Reason" value={trade.exitReason || '—'} />
          </div>

          {/* Explanation */}
          {trade.explanation && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--neon-cyan)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                AI Trade Reasoning
              </div>
              {trade.explanation.entry && (
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <strong>Entry:</strong> {trade.explanation.entry}
                </div>
              )}
              {trade.explanation.stop && (
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <strong>Stop:</strong> {trade.explanation.stop}
                </div>
              )}
              {trade.explanation.target && (
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  <strong>Target:</strong> {trade.explanation.target}
                </div>
              )}
            </div>
          )}

          {/* Dedicated View Chart Button */}
          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onViewDetails) onViewDetails(trade);
              }}
              style={{
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                color: 'var(--neon-cyan)',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '0.74rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <BarChart2 size={13} />
              View Chart & Trade Levels
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricItem({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '0.78rem', fontWeight: '600', marginTop: '2px' }}>{value}</div>
    </div>
  );
}

// ─── Retrospective Card ───────────────────────────────────────────
function RetrospectiveCard({ trade, index }) {
  const retro = trade.retrospective;
  if (!retro) return null;

  const pnl = parseFloat(trade.realizedPnL || trade.pnl || 0);
  const isWin = pnl >= 0;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      borderRadius: '12px',
      border: `1px solid ${isWin ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
      padding: '16px',
      marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        {isWin ? <CheckCircle size={16} color="#10B981" /> : <XCircle size={16} color="#EF4444" />}
        <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>
          Trade #{index + 1}: {trade.symbol} {trade.direction}
        </span>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: '800',
          color: isWin ? '#10B981' : '#EF4444',
          marginLeft: 'auto',
        }}>
          {isWin ? '+' : ''}₹{pnl.toFixed(2)}
        </span>
      </div>

      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '10px', fontStyle: 'italic' }}>
        {retro.summary}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={12} /> What Worked
          </div>
          {retro.whatWorked.map((item, i) => (
            <div key={i} style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>• {item}</div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={12} /> What Failed
          </div>
          {retro.whatFailed.map((item, i) => (
            <div key={i} style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>• {item}</div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <MetricItem label="Entry Valid?" value={retro.wasEntryValid} />
        <MetricItem label="Stop Appropriate?" value={retro.wasStopAppropriate} />
        <MetricItem label="Exit Valid?" value={retro.wasExitValid} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
        <MetricItem label="Strongest Signal" value={retro.strongestSignal} />
        <MetricItem label="Failed Signal" value={retro.failedSignal} />
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────

export default function AISessionOverviewModal({ isOpen, onClose, session }) {
  const [activeTab, setActiveTab] = useState('analytics');
  const [selectedTradeForDetails, setSelectedTradeForDetails] = useState(null);

  const analytics = useMemo(() => {
    if (!session) return null;
    // If session already has analytics, use it; otherwise calculate
    if (session.analytics && session.analytics.totalTrades !== undefined) {
      return session.analytics;
    }
    return SessionJournalService.calculateAnalytics(
      session.trades || [],
      session.starting_capital || 100000,
      session.ending_capital || 100000
    );
  }, [session]);

  if (!isOpen || !session) return null;

  const netPnL = parseFloat(session.realized_pnl || 0);
  const isPositive = netPnL >= 0;
  const trades = session.trades || [];
  const startTime = session.start_time ? new Date(session.start_time).toLocaleString() : '—';
  const endTime = session.end_time ? new Date(session.end_time).toLocaleString() : '—';

  const tabs = [
    { id: 'analytics', label: 'Analytics & Equity', icon: <BarChart2 size={14} /> },
    { id: 'journal', label: 'Trade Journal', icon: <FileText size={14} /> },
    { id: 'analysis', label: 'Post-Trade Analysis', icon: <Target size={14} /> },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--glass-bg, #1a1a2e)',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.1)',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '85vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Award size={22} color="var(--neon-gold, #F59E0B)" />
              AI Session Report
              <span style={{
                fontSize: '0.85rem',
                padding: '3px 10px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.05)',
                fontWeight: '600',
              }}>
                {session.symbol}
              </span>
            </h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {startTime} → {endTime}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => SessionJournalService.exportSessionCSV(session)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '8px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-primary)', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: '600',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
              title="Export trades to CSV"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '8px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Summary Cards Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '10px',
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <SummaryCard
            label="Net P&L"
            value={`${isPositive ? '+' : ''}₹${netPnL.toFixed(2)}`}
            subValue={analytics ? `${analytics.netPnLPct >= 0 ? '+' : ''}${analytics.netPnLPct}%` : ''}
            color={isPositive ? '#10B981' : '#EF4444'}
            icon={isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          />
          <SummaryCard
            label="Win Rate"
            value={analytics ? `${analytics.winRate}%` : '—'}
            subValue={analytics ? `${analytics.winners}W / ${analytics.losers}L` : ''}
            color="#818CF8"
            icon={<Target size={16} />}
          />
          <SummaryCard
            label="Profit Factor"
            value={analytics ? `${analytics.profitFactor}` : '—'}
            color="#F59E0B"
            icon={<Activity size={16} />}
          />
          <SummaryCard
            label="Max Drawdown"
            value={analytics ? `₹${analytics.maxDrawdown}` : '—'}
            subValue={analytics ? `${analytics.maxDrawdownPct}%` : ''}
            color="#EF4444"
            icon={<AlertTriangle size={16} />}
          />
          <SummaryCard
            label="Total Trades"
            value={`${session.trade_count || trades.length}`}
            subValue={analytics ? `Avg ${analytics.avgDurationMinutes}m` : ''}
            color="#06B6D4"
            icon={<BarChart2 size={16} />}
          />
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '8px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? '700' : '500',
                fontSize: '0.78rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
        }}>
          {activeTab === 'analytics' && analytics && (
            <div>
              {/* Equity Curve */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={16} color="var(--neon-cyan)" /> Equity Curve
                </h3>
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <EquityCurveChart equityCurve={analytics.equityCurve} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span>Start: ₹{(session.starting_capital || 100000).toLocaleString('en-IN')}</span>
                    <span>End: ₹{(session.ending_capital || 100000).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Detailed Metrics Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '10px',
              }}>
                <MetricCard label="Gross Profit" value={`₹${analytics.grossProfit}`} color="#10B981" />
                <MetricCard label="Gross Loss" value={`₹${analytics.grossLoss}`} color="#EF4444" />
                <MetricCard label="Largest Winner" value={`₹${analytics.largestWinner}`} color="#10B981" />
                <MetricCard label="Largest Loser" value={`₹${analytics.largestLoser}`} color="#EF4444" />
                <MetricCard label="Avg Winner" value={`₹${analytics.avgWinner}`} color="#10B981" />
                <MetricCard label="Avg Loser" value={`₹${analytics.avgLoser}`} color="#EF4444" />
                <MetricCard label="Avg R/R" value={`${analytics.avgRiskReward}:1`} color="#818CF8" />
                <MetricCard label="Avg Duration" value={`${analytics.avgDurationMinutes}m`} color="#06B6D4" />
              </div>
            </div>
          )}

          {activeTab === 'journal' && (
            <div>
              {trades.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <Minus size={28} style={{ marginBottom: '8px', opacity: 0.4 }} />
                  <div>No trades executed in this session.</div>
                </div>
              ) : (
                trades.map((trade, i) => (
                  <TradeRow key={i} trade={trade} index={i} onViewDetails={(t) => setSelectedTradeForDetails(t)} />
                ))
              )}
            </div>
          )}

          {activeTab === 'analysis' && (
            <div>
              {trades.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <Minus size={28} style={{ marginBottom: '8px', opacity: 0.4 }} />
                  <div>No trades to analyse.</div>
                </div>
              ) : (
                trades.map((trade, i) => (
                  <RetrospectiveCard key={i} trade={trade} index={i} />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Visual Trade Level Breakdown Modal */}
      {selectedTradeForDetails && (
        <TradeDetailsModal
          isOpen={!!selectedTradeForDetails}
          onClose={() => setSelectedTradeForDetails(null)}
          trade={selectedTradeForDetails}
          candles={session?.candles || []}
        />
      )}
    </div>
  );
}

// ─── Shared Mini-Components ──────────────────────────────────────

function SummaryCard({ label, value, subValue, color, icon }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '10px',
      padding: '12px',
      border: '1px solid rgba(255,255,255,0.06)',
      textAlign: 'center',
    }}>
      <div style={{ color, marginBottom: '4px', display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: '800', color }}>{value}</div>
      {subValue && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>{subValue}</div>}
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{label}</div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '8px',
      padding: '10px 12px',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{label}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: '700', color, marginTop: '4px' }}>{value}</div>
    </div>
  );
}
