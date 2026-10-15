/**
 * MultiStockWorkspaceGrid.jsx
 * Multi-Stock Simultaneous Workspace View.
 *
 * Implements:
 * - 2-Panel Split-Screen (side-by-side on wide screens, stacked on smaller screens)
 * - 3-Panel Grid
 * - 4-Panel 2x2 Grid
 * - 5+ Sessions Responsive Grid / Scrollable Cards
 * - Independent Candlestick Charts with Live Trade Levels and Markers
 * - Live Position & P&L Overlays
 * - Per-Session Controls: EXPAND, MINIMIZE, STOP AI
 *
 * ⚠️ PAPER TRADING ONLY.
 */

import React, { useState } from 'react';
import { 
  Maximize2, Minimize2, StopCircle, TrendingUp, TrendingDown, 
  Activity, Shield, Zap, AlertCircle 
} from 'lucide-react';
import AIIntradayChart from './AIIntradayChart';
import AIStatusBadge from './AIStatusBadge';
import AIBiasBadge from './AIBiasBadge';

export default function MultiStockWorkspaceGrid({
  sessions = {},
  onExpandSession,
  onStopSession,
  onMinimizeSession,
}) {
  const [minimizedSymbols, setMinimizedSymbols] = useState(new Set());

  const activeSessions = Object.values(sessions).filter(
    s => s.isActive && !minimizedSymbols.has(s.symbol)
  );

  const toggleMinimize = (sym) => {
    setMinimizedSymbols(prev => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
    if (onMinimizeSession) onMinimizeSession(sym);
  };

  const count = activeSessions.length;

  // Grid styling based on session count
  const getGridStyle = () => {
    if (count === 1) return { gridTemplateColumns: '1fr' };
    if (count === 2) return { gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))' };
    if (count === 3) return { gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' };
    if (count === 4) return { gridTemplateColumns: 'repeat(2, 1fr)' };
    return { gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' };
  };

  if (count === 0) {
    return (
      <div className="card text-center" style={{ padding: '40px 20px', color: 'var(--text-muted)' }}>
        <AlertCircle size={28} style={{ marginBottom: '8px', opacity: 0.5 }} />
        <div>All active AI sessions are minimized. Click on a session from the top tabs to restore.</div>
      </div>
    );
  }

  return (
    <div
      className="multi-stock-workspace-grid"
      style={{
        display: 'grid',
        ...getGridStyle(),
        gap: '16px',
        marginBottom: '24px',
      }}
    >
      {activeSessions.map((session) => {
        const isPositive = session.changePct >= 0;
        const pos = session.positionSummary;
        const hasPos = !!pos;
        const isPosLong = hasPos && pos.direction === 'LONG';
        const pnl = pos ? pos.unrealizedPnL || 0 : 0;
        const isPnlWin = pnl >= 0;

        return (
          <div
            key={session.symbol}
            className="card multi-session-card"
            style={{
              padding: '0',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: '#0B1120',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
            }}
          >
            {/* Card Header Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              {/* Left: Symbol & Live Price */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {session.symbol}
                  </span>
                  <span style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                    ₹{session.price > 0 ? session.price.toFixed(2) : '-'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      color: isPositive ? '#10B981' : '#EF4444',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {isPositive ? '+' : ''}{session.changePct?.toFixed(2)}%
                  </span>
                </div>
              <AIStatusBadge state={session.status} size="sm" />
              </div>

              {/* Right: Quick Actions (Expand, Minimize, Stop) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* Expand into full workspace */}
                <button
                  onClick={() => onExpandSession && onExpandSession(session.symbol)}
                  title="Expand to Full Workspace"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Maximize2 size={12} />
                  EXPAND
                </button>

                {/* Minimize from grid */}
                <button
                  onClick={() => toggleMinimize(session.symbol)}
                  title="Minimize (AI continues in background)"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Minimize2 size={12} />
                  MINIMIZE
                </button>

                {/* Stop AI */}
                <button
                  onClick={() => onStopSession && onStopSession(session.symbol)}
                  title="Stop AI session & liquidate position"
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    color: '#EF4444',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <StopCircle size={12} />
                  STOP
                </button>
              </div>
            </div>

            {/* Candlestick Chart with Live Levels & Markers */}
            <div style={{ height: '280px', position: 'relative' }}>
              <AIIntradayChart
                data={session.chartData}
                isLoading={session.chartData.length === 0}
                activeTimeframe={session.timeframe || '5m'}
                markers={session.markers || []}
                tradeLevels={session.tradeLevels || null}
              />
            </div>

            {/* Live Position & Trade Level Footer Bar */}
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(0, 0, 0, 0.3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.72rem',
              }}
            >
              {hasPos ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      fontWeight: '800',
                      color: isPosLong ? '#10B981' : '#EF4444',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: isPosLong ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    }}
                  >
                    {pos.direction} {pos.quantity} Shs
                  </span>
                  <span>Entry: ₹{pos.entry?.toFixed(2)}</span>
                  <span style={{ color: '#EF4444' }}>SL: ₹{pos.stopLoss?.toFixed(2)}</span>
                  <span style={{ color: '#10B981' }}>TP1: ₹{pos.target1?.toFixed(2)}</span>
                </div>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>
                  Setup: {session.tradeDecision?.setup?.replace(/_/g, ' ') || 'Waiting for setup...'}
                </span>
              )}

              {/* Unrealized P&L */}
              <div>
                <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>Open P&L:</span>
                <strong style={{ color: isPnlWin ? '#10B981' : '#EF4444' }}>
                  {hasPos ? `${isPnlWin ? '+' : ''}₹${pnl.toFixed(2)}` : '₹0.00'}
                </strong>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
