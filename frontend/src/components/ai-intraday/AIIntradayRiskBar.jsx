import React from 'react';
import { ShieldCheck, Settings, AlertTriangle, DollarSign, Percent, PieChart, Lock } from 'lucide-react';

export default function AIIntradayRiskBar({ 
  account, 
  riskSettings, 
  calculatedSizing, 
  onOpenSettings 
}) {
  const finiteOr = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const capital = Math.max(0, finiteOr(account?.accountValue ?? riskSettings?.paperCapital, 100000));
  const usedCapital = Math.max(0, finiteOr(account?.usedCapital));
  const dailyPnL = finiteOr(account?.dailyPnL);
  const unrealizedPnL = finiteOr(account?.unrealizedPnL);
  const maxDailyLoss = Math.max(0, finiteOr(riskSettings?.maxDailyLoss, 3000));

  // Remaining daily loss budget before circuit breaker trips
  const remainingDailyLoss = Math.max(0, maxDailyLoss + dailyPnL + unrealizedPnL);
  // Account Exposure %
  const exposurePct = capital > 0 ? ((usedCapital / capital) * 100).toFixed(1) : '0.0';

  // Planned Risk Amount
  const riskPct = finiteOr(riskSettings?.maxRiskPerTradePct, 1.0);
  const riskAmount = finiteOr(calculatedSizing?.riskAmount, capital * (riskPct / 100));
  // A shared account's first position may belong to another stock workspace.
  // Only show sizing calculated for the current signal.
  const plannedQty = Math.max(0, finiteOr(calculatedSizing?.quantity));

  const isDailyLimitNear = remainingDailyLoss < (maxDailyLoss * 0.3);

  return (
    <div 
      className="card mb-16" 
      style={{
        background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.04) 0%, rgba(15, 23, 42, 0.6) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '12px 18px',
      }}
    >
      <div className="flex-between" style={{ flexWrap: 'wrap', gap: '14px' }}>
        {/* Left: Engine Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--green)',
            }}
          >
            <ShieldCheck size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                RISK ENGINE
              </span>
              <span
                style={{
                  fontSize: '0.62rem',
                  fontWeight: '800',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--green)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  letterSpacing: '0.5px',
                }}
              >
                AUTHORITY ACTIVE
              </span>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
              Autonomous veto power • Intraday risk protection
            </p>
          </div>
        </div>

        {/* Center: Live Risk Metrics Strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {/* Risk per Trade */}
          <div className="risk-metric">
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Risk / Trade</span>
            <span style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--text-primary)' }}>
              {riskPct}% <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>(₹{Math.round(riskAmount).toLocaleString('en-IN')})</span>
            </span>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

          {/* Position Sizing */}
          <div className="risk-metric">
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Position Size</span>
            <span style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--neon-blue, #00F0FF)' }}>
              {plannedQty > 0 ? `${plannedQty} Qty` : 'Calculated on Signal'}
            </span>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

          {/* Capital Allocation & Exposure */}
          <div className="risk-metric">
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>Account Exposure</span>
            <span style={{ fontSize: '0.88rem', fontWeight: '800', color: parseFloat(exposurePct) > 20 ? '#F59E0B' : 'var(--text-primary)' }}>
              {exposurePct}% <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>(₹{usedCapital.toLocaleString('en-IN')})</span>
            </span>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

          {/* Daily Loss Limit / Budget */}
          <div className="risk-metric">
            <span style={{ fontSize: '0.65rem', color: isDailyLimitNear ? 'var(--red)' : 'var(--text-muted)', display: 'block' }}>
              Remaining Daily Risk
            </span>
            <span style={{ fontSize: '0.88rem', fontWeight: '800', color: isDailyLimitNear ? 'var(--red)' : 'var(--green)' }}>
              ₹{Math.max(0, remainingDailyLoss).toLocaleString('en-IN')} <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>/ ₹{maxDailyLoss.toLocaleString('en-IN')}</span>
            </span>
          </div>
        </div>

        {/* Right: Settings Action Button */}
        <div>
          <button
            onClick={onOpenSettings}
            className="btn btn-secondary"
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid var(--border)',
            }}
            title="Configure intraday risk rules"
          >
            <Settings size={14} />
            <span>Risk Rules</span>
          </button>
        </div>
      </div>
    </div>
  );
}
