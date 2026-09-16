import React from 'react';
import { Play, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import AIBiasBadge from './AIBiasBadge';

export default function IntradayOpportunityRow({ item, onStartAI }) {
  const price = item.price || 0;
  const changePct = item.changePct || 0;
  const isPositive = changePct >= 0;
  const rvol = item.rvol || item.volumeRatio || 1.0;

  return (
    <tr className="intraday-row">
      {/* 1. Rank */}
      <td className="cell-rank">
        <span className="rank-badge">#{item.rank}</span>
      </td>

      {/* 2 & 3. Symbol & Company Name */}
      <td className="cell-stock">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="stock-sym">{item.sym}</span>
          <span className="stock-name">{item.name}</span>
        </div>
      </td>

      {/* 4. Current Price */}
      <td className="cell-price">
        <span className="price-val">₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </td>

      {/* 5. Day Change % */}
      <td className="cell-change">
        <span className={`change-pill ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {isPositive ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      </td>

      {/* 6. Day High */}
      <td className="cell-high muted-val">
        ₹{(item.high || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </td>

      {/* 7. Day Low */}
      <td className="cell-low muted-val">
        ₹{(item.low || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </td>

      {/* 8. Volume */}
      <td className="cell-volume muted-val">
        {item.volume || 'N/A'}
      </td>

      {/* 9. Relative Volume (RVOL) */}
      <td className="cell-rvol" style={{ textAlign: 'center' }}>
        <span
          style={{
            fontSize: '0.78rem',
            fontWeight: '700',
            padding: '2px 6px',
            borderRadius: '4px',
            background: rvol >= 1.5 ? 'rgba(0, 240, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
            color: rvol >= 1.5 ? 'var(--neon-cyan)' : 'var(--text-secondary)',
            border: rvol >= 1.5 ? '1px solid var(--neon-cyan-glow)' : '1px solid transparent',
          }}
        >
          {rvol.toFixed(2)}x
        </span>
      </td>

      {/* 10. Intraday Trend */}
      <td className="cell-trend">
        <span
          className={`trend-tag ${
            (item.trend || '').toLowerCase().includes('bull')
              ? 'bullish'
              : (item.trend || '').toLowerCase().includes('bear')
              ? 'bearish'
              : 'neutral'
          }`}
        >
          {item.trend || 'Sideways'}
        </span>
      </td>

      {/* 11. AI Score */}
      <td className="cell-score">
        <div className="score-wrap">
          <span className="score-val">{item.aiScore}</span>
          <span className="score-max">/100</span>
          <div className="mini-score-bar">
            <div
              className="mini-score-fill"
              style={{
                width: `${item.aiScore}%`,
                background: item.aiScore >= 80 ? 'var(--neon-cyan)' : item.aiScore >= 70 ? '#3B82F6' : '#F59E0B',
              }}
            />
          </div>
        </div>
      </td>

      {/* 12. AI Confidence */}
      <td className="cell-confidence">
        <div className="confidence-wrap">
          <span className="conf-val">{item.aiConfidence}%</span>
          <div className="mini-conf-track">
            <div
              className="mini-conf-fill"
              style={{
                width: `${item.aiConfidence}%`,
                background: item.aiConfidence >= 80 ? 'var(--green)' : 'var(--neon-cyan)',
              }}
            />
          </div>
        </div>
      </td>

      {/* 13. Bias */}
      <td className="cell-bias">
        <AIBiasBadge bias={item.bias} size="sm" />
      </td>

      {/* 14. Start AI Button */}
      <td className="cell-action">
        <button
          className="btn btn-primary btn-sm start-ai-btn"
          onClick={() => onStartAI && onStartAI(item.sym)}
          title={`Start AI workspace for ${item.sym}`}
        >
          <Play size={12} fill="currentColor" />
          START AI
        </button>
      </td>
    </tr>
  );
}
