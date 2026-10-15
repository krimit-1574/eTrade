import React from 'react';
import { Briefcase, Shield, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';

export default function AIIntradayPositionPanel({ position, onClosePosition }) {
  const hasPosition = !!position;
  const isLong = hasPosition && position.direction === 'LONG';
  const pnl = hasPosition ? position.unrealizedPnL || 0 : 0;
  const pnlPct = hasPosition ? position.pnlPct || 0 : 0;
  const isPnlPositive = pnl >= 0;

  // Calculate position duration
  let duration = '-';
  if (hasPosition && position.entryTime) {
    const entryMs = new Date(position.entryTime).getTime();
    // Wall-clock time is intentional: duration should reflect time since entry.
    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();
    const diffMin = Math.floor((nowMs - entryMs) / 60000);
    if (diffMin < 60) duration = `${diffMin}m`;
    else duration = `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
  }

  return (
    <div className="card intraday-panel" style={{ padding: '20px' }}>
      <div className="flex-between mb-16" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: hasPosition ? (isLong ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)') : 'rgba(255, 255, 255, 0.05)',
              color: hasPosition ? (isLong ? 'var(--green)' : 'var(--red)') : 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Briefcase size={16} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0 }}>Current Position</h3>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Paper trade execution tracker</span>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            background: hasPosition ? (isLong ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)') : 'rgba(255, 255, 255, 0.04)',
            color: hasPosition ? (isLong ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: '10px',
            border: hasPosition ? `1px solid ${isLong ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` : '1px solid var(--border)',
          }}
        >
          {hasPosition ? (isLong ? '▲ LONG' : '▼ SHORT') : 'IDLE'}
        </span>
      </div>

      {/* Position Metrics Grid */}
      <div className="grid-3" style={{ gap: '12px', marginBottom: '16px' }}>
        <div className="pos-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Direction</span>
          <div style={{ fontSize: '0.95rem', fontWeight: '800', color: hasPosition ? (isLong ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {hasPosition && (isLong ? <TrendingUp size={14} /> : <TrendingDown size={14} />)}
            {hasPosition ? position.direction : 'NONE'}
          </div>
        </div>

        <div className="pos-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Quantity</span>
          <div style={{ fontSize: '0.95rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
            {hasPosition ? position.quantity : 0}
          </div>
        </div>

        <div className="pos-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Entry Price</span>
          <div style={{ fontSize: '0.95rem', fontWeight: '800', color: hasPosition ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: '2px' }}>
            {hasPosition ? `₹${position.entryPrice}` : '-'}
          </div>
        </div>

        <div className="pos-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Stop Loss</span>
          <div style={{ fontSize: '0.95rem', fontWeight: '800', color: hasPosition ? 'var(--red)' : 'var(--text-muted)', marginTop: '2px' }}>
            {hasPosition && position.stopLoss ? `₹${position.stopLoss}` : '-'}
          </div>
        </div>

        <div className="pos-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Target 1</span>
          <div style={{ fontSize: '0.95rem', fontWeight: '800', color: hasPosition ? 'var(--green)' : 'var(--text-muted)', marginTop: '2px' }}>
            {hasPosition && position.target1 ? `₹${position.target1}` : '-'}
          </div>
        </div>

        <div className="pos-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Unrealized P&L</span>
          <div style={{ fontSize: '0.95rem', fontWeight: '800', color: isPnlPositive ? 'var(--green)' : 'var(--red)', marginTop: '2px' }}>
            {hasPosition ? `${isPnlPositive ? '+' : ''}₹${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)` : '₹0'}
          </div>
        </div>
      </div>

      {/* Position Duration or Empty Notice */}
      <div
        style={{
          padding: '8px 12px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '4px',
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
        }}
      >
        {hasPosition ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Position open for {duration} • Last: ₹{position.currentPrice || '-'}</span>
            {onClosePosition && (
              <button
                onClick={onClosePosition}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#EF4444',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                title="Close active paper position immediately"
              >
                CLOSE POSITION
              </button>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>No active paper positions for this symbol.</div>
        )}
      </div>
    </div>
  );
}
