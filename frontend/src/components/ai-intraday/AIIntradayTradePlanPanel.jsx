import React from 'react';
import { Target, Compass, AlertCircle, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';

export default function AIIntradayTradePlanPanel({ tradeDecision }) {
  
  const hasDecision = tradeDecision && tradeDecision.decision !== 'WAIT';
  
  return (
    <div className="card intraday-panel" style={{ padding: '20px' }}>
      <div className="flex-between mb-16" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(176, 38, 255, 0.15)',
              color: 'var(--neon-purple)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Compass size={16} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0 }}>Trade Plan</h3>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Automated algorithmic risk matrix</span>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            background: hasDecision ? 'rgba(0, 240, 255, 0.1)' : 'rgba(176, 38, 255, 0.1)',
            color: hasDecision ? 'var(--neon-cyan)' : 'var(--neon-purple)',
            padding: '2px 8px',
            borderRadius: '10px',
            border: hasDecision ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid rgba(176, 38, 255, 0.3)',
          }}
        >
          {hasDecision ? 'SETUP VALIDATED' : 'PLANNER READY'}
        </span>
      </div>

      {/* Plan Notice or Setup Name */}
      <div
        className="mb-16"
        style={{
          background: hasDecision ? 'rgba(0, 255, 128, 0.05)' : 'rgba(255, 255, 255, 0.02)',
          border: hasDecision ? '1px solid rgba(0, 255, 128, 0.2)' : '1px dashed var(--border)',
          borderRadius: '6px',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {hasDecision ? (
             <CheckCircle2 size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
          ) : (
             <AlertCircle size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: '0.82rem', color: hasDecision ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: hasDecision ? '700' : '400' }}>
            {hasDecision ? tradeDecision.setup.replace(/_/g, ' ').toUpperCase() : 'No validated setup detected.'}
          </span>
        </div>
        
        {tradeDecision && tradeDecision.invalidation && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '26px' }}>
            {hasDecision ? `Invalidation: ${tradeDecision.invalidation}` : `Reason: ${tradeDecision.invalidation}`}
          </div>
        )}
      </div>

      {/* Trade Plan Matrix Grid */}
      <div className="grid-2" style={{ gap: '10px' }}>
        <div className="plan-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Potential Direction</span>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: hasDecision ? (tradeDecision.direction === 'LONG' ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {hasDecision && (tradeDecision.direction === 'LONG' ? <TrendingUp size={14} /> : <TrendingDown size={14} />)}
            {hasDecision ? tradeDecision.direction : '-'}
          </div>
        </div>

        <div className="plan-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Suggested Entry</span>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: hasDecision ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: '2px' }}>
            {hasDecision && tradeDecision.entry ? `₹${tradeDecision.entry}` : '-'}
          </div>
        </div>

        <div className="plan-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Stop Loss</span>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: hasDecision ? 'var(--red)' : 'var(--text-muted)', marginTop: '2px' }}>
            {hasDecision && tradeDecision.stopLoss ? `₹${tradeDecision.stopLoss}` : '-'}
          </div>
        </div>

        <div className="plan-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Target 1 (1:1.5)</span>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: hasDecision ? 'var(--green)' : 'var(--text-muted)', marginTop: '2px' }}>
            {hasDecision && tradeDecision.target1 ? `₹${tradeDecision.target1}` : '-'}
          </div>
        </div>

        <div className="plan-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Target 2 (1:2.5)</span>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: hasDecision ? 'var(--neon-cyan)' : 'var(--text-muted)', marginTop: '2px' }}>
            {hasDecision && tradeDecision.target2 ? `₹${tradeDecision.target2}` : '-'}
          </div>
        </div>

        <div className="plan-item" style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Risk / Reward</span>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: hasDecision ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: '2px' }}>
            {hasDecision && tradeDecision.riskReward ? `1 : ${tradeDecision.riskReward}` : '-'}
          </div>
        </div>
      </div>
    </div>
  );
}
