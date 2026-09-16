import React from 'react';
import { ArrowLeft, Zap, Play, ShieldCheck, Sparkles } from 'lucide-react';
import AIBiasBadge from './AIBiasBadge';
import AIStatusBadge from './AIStatusBadge';

export default function AIIntradayWorkspacePlaceholder({ symbol, onBack }) {
  const stock = {
    sym: symbol || 'RELIANCE',
    name: symbol ? `${symbol} (NSE India)` : 'Reliance Industries Ltd.',
    price: 2945.35,
    changePct: 1.21,
    high: 2965.00,
    low: 2912.40,
    volume: '8.45M',
    trend: 'Bullish',
    aiScore: 91,
    aiConfidence: 84,
    bias: 'LONG',
  };

  return (
    <div className="ai-workspace-container">
      {/* Navigation Top Bar */}
      <div className="mb-24 flex-between">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={16} /> Back to AI Intraday Dashboard
        </button>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Route: <code style={{ color: 'var(--neon-cyan)' }}>/ai-intraday/{stock.sym}</code>
        </span>
      </div>

      {/* Main Stock Header Card */}
      <div className="card card-accent-gold mb-24" style={{ padding: '24px' }}>
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: '800', margin: 0 }}>{stock.sym}</h1>
              <AIBiasBadge bias={stock.bias} size="md" />
              <AIStatusBadge state="READY" size="sm" />
            </div>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {stock.name} • NSE Intraday Execution Workspace
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: '800' }}>
              ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ color: stock.changePct >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: '700', fontSize: '0.9rem' }}>
              {stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}% Today
            </div>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div
          className="grid-4 mt-24"
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
          }}
        >
          <div>
            <span className="metric-label" style={{ fontSize: '0.65rem' }}>AI Opportunity Score</span>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--neon-cyan)' }}>
              {stock.aiScore} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ 100</span>
            </div>
          </div>

          <div>
            <span className="metric-label" style={{ fontSize: '0.65rem' }}>AI Confidence</span>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--green)' }}>
              {stock.aiConfidence}%
            </div>
          </div>

          <div>
            <span className="metric-label" style={{ fontSize: '0.65rem' }}>Intraday Trend</span>
            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              {stock.trend}
            </div>
          </div>

          <div>
            <span className="metric-label" style={{ fontSize: '0.65rem' }}>Estimated Volume</span>
            <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              {stock.volume}
            </div>
          </div>
        </div>
      </div>

      {/* Part 1 Placeholder Notice Card */}
      <div
        className="card"
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          background: 'linear-gradient(135deg, rgba(15, 15, 30, 0.9), rgba(10, 10, 20, 0.9))',
          border: '1px dashed var(--neon-cyan-glow)',
        }}
      >
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '16px',
            background: 'var(--neon-cyan-bg)',
            color: 'var(--neon-cyan)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            border: '1px solid var(--neon-cyan-glow)',
            boxShadow: '0 0 20px var(--neon-cyan-bg)',
          }}
        >
          <Sparkles size={32} />
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '8px' }}>
          AI Trading Workspace for <span className="gold-text">{stock.sym}</span>
        </h2>

        <p style={{ maxWidth: '600px', margin: '0 auto 24px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          You have successfully connected to the intraday route for <strong>{stock.sym}</strong>.
          The complete execution workspace, live chart signals, automated orders, and decision engine will be implemented in subsequent parts.
        </p>

        <div style={{ display: 'inline-flex', gap: '12px' }}>
          <button className="btn btn-primary" onClick={onBack}>
            <Zap size={16} /> Return to AI Intraday Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
