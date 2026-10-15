import React from 'react';
import { Activity, Radio, Cpu, ShieldCheck, Sparkles, Clock, AlertCircle } from 'lucide-react';
import AIStatusBadge from './AIStatusBadge';
import AIBiasBadge from './AIBiasBadge';

export default function AIIntradayAnalysisPanel({
  aiStatus = 'MONITORING',
  bias = 'WAIT',
  aiScore = 75,
  aiConfidence = 80,
  analysisData = null
}) {
  return (
    <div className="card intraday-panel" style={{ padding: '20px' }}>
      <div className="flex-between mb-16" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'var(--neon-cyan-bg)',
              color: 'var(--neon-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={16} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0 }}>AI Trade Analysis</h3>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Real-time signal & pattern engine</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: '800',
              letterSpacing: '0.5px',
              color: 'var(--neon-cyan)',
              background: 'var(--neon-cyan-bg)',
              padding: '4px 10px',
              borderRadius: '12px',
              border: '1px solid var(--neon-cyan-glow)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Radio size={12} className="spin-anim" /> AI STATUS: {aiStatus.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Current Analysis Callout */}
      <div
        className="mb-16"
        style={{
          background: 'rgba(0, 240, 255, 0.03)',
          borderLeft: '3px solid var(--neon-cyan)',
          borderRadius: '4px',
          padding: '12px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <Sparkles size={14} style={{ color: 'var(--neon-cyan)' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Current Analysis
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {analysisData ? analysisData.explanation : 'Waiting for sufficient data to complete analysis...'}
        </p>
      </div>

      {/* Real-time Technical Metric Badges */}
      <div className="grid-3 mb-16" style={{ gap: '10px' }}>
        <div className="metric-box" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Calculated Bias</span>
          <div style={{ marginTop: '4px' }}>
            <AIBiasBadge bias={bias} size="sm" />
          </div>
        </div>

        <div className="metric-box" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Opportunity Score</span>
          <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--neon-cyan)', marginTop: '2px' }}>
            {aiScore} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/ 100</span>
          </div>
        </div>

        <div className="metric-box" style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <span className="metric-label" style={{ fontSize: '0.65rem' }}>Signal Confidence</span>
          <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--green)', marginTop: '2px' }}>
            {aiConfidence}%
          </div>
        </div>
      </div>

      {/* Detailed Technical Data Grid */}
      {analysisData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Trend</span>
            <span style={{ color: analysisData.trend === 'bullish' ? 'var(--green)' : (analysisData.trend === 'bearish' ? 'var(--red)' : 'var(--text-primary)'), textTransform: 'uppercase', fontWeight: '600' }}>{analysisData.trend}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Structure</span>
            <span style={{ color: 'var(--text-primary)', textTransform: 'uppercase', fontWeight: '600' }}>{analysisData.marketStructure.replace(/_/g, ' ')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>VWAP</span>
            <span style={{ color: analysisData.priceVsVWAP === 'above' ? 'var(--green)' : 'var(--red)', textTransform: 'uppercase', fontWeight: '600' }}>{analysisData.priceVsVWAP}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>RSI (14)</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{analysisData.rsi}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Support</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{analysisData.support ? `₹${analysisData.support}` : '-'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Resistance</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{analysisData.resistance ? `₹${analysisData.resistance}` : '-'}</span>
          </div>
          {analysisData.detectedPatterns && analysisData.detectedPatterns.length > 0 && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Patterns</span>
              <span style={{ color: 'var(--neon-cyan)', textTransform: 'uppercase', fontWeight: '600' }}>{analysisData.detectedPatterns.map(p => p.replace(/_/g, ' ')).join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
