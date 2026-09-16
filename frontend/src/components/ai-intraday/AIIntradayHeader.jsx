import React from 'react';
import { Zap, RefreshCw, Cpu } from 'lucide-react';
import AIStatusBadge from './AIStatusBadge';

export default function AIIntradayHeader({
  aiState = 'READY',
  onRefresh,
  isRefreshing = false,
}) {
  return (
    <div className="page-header flex-between mb-24" style={{ flexWrap: 'wrap', gap: '16px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000',
              boxShadow: 'var(--shadow-neon)',
            }}
          >
            <Zap size={20} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0 }}>
            AI Intraday <span className="gold-text">Dashboard</span>
          </h1>
          <AIStatusBadge state={aiState} size="sm" />
        </div>
        <p style={{ marginTop: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          High-frequency algorithmic screening, technical pattern recognition, and automated trade bias detection.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
          }}
        >
          <Cpu size={14} style={{ color: 'var(--neon-cyan)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Model:</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>DeepTrade Intraday v1.0</span>
        </div>

        <button
          className="btn btn-outline btn-sm"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin-anim' : ''} />
          {isRefreshing ? 'Scanning...' : 'Scan Market'}
        </button>
      </div>
    </div>
  );
}
