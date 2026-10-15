/**
 * MultiAIOverviewPanel.jsx
 * Global overview panel showing all active AI Intraday sessions.
 *
 * Displays:
 * - Session cards for each active stock with live P&L, status, and price
 * - Quick actions (Stop, View Workspace)
 * - Global account summary (total P&L, capital, active positions)
 *
 * ⚠️ PAPER TRADING ONLY.
 */

import React, { useMemo } from 'react';
import {
  Zap, StopCircle, Eye, TrendingUp, TrendingDown,
  Activity, AlertCircle, DollarSign, BarChart2
} from 'lucide-react';
import AIStatusBadge from './AIStatusBadge';

export default function MultiAIOverviewPanel({
  sessions = {},
  account,
  activeCount = 0,
  onViewSession,
  onStopSession,
  onStopAll,
}) {
  const sessionList = useMemo(() => {
    return Object.values(sessions).filter(s => s.isActive);
  }, [sessions]);

  const globalStats = useMemo(() => {
    const totalUnrealized = sessionList.reduce((sum, s) => {
      return sum + (s.positionSummary?.unrealizedPnL || 0);
    }, 0);
    const positionsCount = sessionList.filter(s => s.hasPosition).length;
    const waitingCount = sessionList.filter(s => !s.hasPosition).length;

    return {
      totalUnrealized,
      positionsCount,
      waitingCount,
      balance: account?.accountValue ?? account?.availableCash ?? 100000,
      realizedPnL: account?.realizedPnL ?? 0,
      dailyPnL: account?.dailyPnL ?? 0,
    };
  }, [sessionList, account]);

  if (sessionList.length === 0) {
    return null;
  }

  return (
    <div className="multi-ai-overview card mb-20" style={{ padding: '0' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.06), rgba(6, 182, 212, 0.04))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={16} color="#fff" />
          </div>
          <div>
            <span style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              AI Trading Sessions
            </span>
            <span
              style={{
                marginLeft: '8px',
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10B981',
              }}
            >
              {activeCount} Active
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Global Stats */}
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.74rem', marginRight: '8px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Balance: <strong style={{ color: 'var(--text-primary)' }}>
                ₹{globalStats.balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </strong>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Day P&L:{' '}
              <strong style={{ color: globalStats.dailyPnL >= 0 ? '#10B981' : '#EF4444' }}>
                {globalStats.dailyPnL >= 0 ? '+' : ''}₹{globalStats.dailyPnL.toFixed(0)}
              </strong>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Open:{' '}
              <strong style={{ color: globalStats.totalUnrealized >= 0 ? '#10B981' : '#EF4444' }}>
                {globalStats.totalUnrealized >= 0 ? '+' : ''}₹{globalStats.totalUnrealized.toFixed(0)}
              </strong>
            </span>
          </div>

          {activeCount > 1 && (
            <button
              className="btn btn-sm"
              onClick={onStopAll}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                fontSize: '0.72rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <StopCircle size={12} /> Stop All
            </button>
          )}
        </div>
      </div>

      {/* Session Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
          padding: '14px 16px',
        }}
      >
        {sessionList.map((session) => (
          <SessionCard
            key={session.symbol}
            session={session}
            onView={() => onViewSession?.(session.symbol)}
            onStop={() => onStopSession?.(session.symbol)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Individual Session Card ──────────────────────────────────────

function SessionCard({ session, onView, onStop }) {
  const isPositive = session.changePct >= 0;
  const pnl = session.positionSummary?.unrealizedPnL || 0;
  const pnlPct = session.positionSummary?.pnlPct || 0;
  const isPnlPositive = pnl >= 0;

  return (
    <div
      className="session-card"
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(255, 255, 255, 0.02)',
        border: `1px solid ${session.hasPosition
          ? (isPnlPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)')
          : 'rgba(255, 255, 255, 0.06)'
        }`,
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
      onClick={onView}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
        e.currentTarget.style.borderColor = session.hasPosition
          ? (isPnlPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)')
          : 'rgba(255, 255, 255, 0.06)';
      }}
    >
      {/* Row 1: Symbol + Status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: '800', fontSize: '0.92rem', color: 'var(--text-primary)' }}>
            {session.symbol}
          </span>
        <AIStatusBadge state={session.status} size="sm" />
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={(e) => { e.stopPropagation(); onStop(); }}
          title="Stop this session"
          style={{ padding: '3px 6px', color: 'var(--text-muted)' }}
        >
          <StopCircle size={14} />
        </button>
      </div>

      {/* Row 2: Price + Change */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-primary)' }}>
          ₹{session.price > 0 ? session.price.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'}
        </span>
        <span style={{
          fontSize: '0.74rem',
          fontWeight: '700',
          color: isPositive ? '#10B981' : '#EF4444',
        }}>
          {isPositive ? (
            <TrendingUp size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
          ) : (
            <TrendingDown size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
          )}
          {isPositive ? '+' : ''}{session.changePct?.toFixed(2) || '0.00'}%
        </span>
      </div>

      {/* Row 3: Position Info (if active) */}
      {session.hasPosition && session.positionSummary ? (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: '6px',
            background: isPnlPositive ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
            border: `1px solid ${isPnlPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'}`,
            marginTop: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {session.positionSummary.direction === 'LONG' ? '📈 LONG' : '📉 SHORT'}{' '}
              × {session.positionSummary.remainingQuantity || session.positionSummary.quantity}
            </span>
            <span style={{ fontWeight: '800', color: isPnlPositive ? '#10B981' : '#EF4444' }}>
              {isPnlPositive ? '+' : ''}₹{pnl.toFixed(0)} ({pnlPct.toFixed(1)}%)
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginTop: '4px', color: 'var(--text-muted)' }}>
            <span>Entry: ₹{session.positionSummary.entry?.toFixed(1)}</span>
            <span>SL: ₹{session.positionSummary.stopLoss?.toFixed(1)}</span>
            <span>T1: ₹{session.positionSummary.target1?.toFixed(1)}</span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          <Activity size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
          {session.tradeDecision?.decision === 'BUY' || session.tradeDecision?.decision === 'SHORT'
            ? `${session.tradeDecision.decision} signal detected — awaiting execution`
            : 'Scanning for setups…'
          }
        </div>
      )}
    </div>
  );
}
