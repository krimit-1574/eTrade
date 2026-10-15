import React from 'react';
import { Activity, ShieldCheck, Wallet, DollarSign, ArrowUpDown, Layers, AlertCircle } from 'lucide-react';
import AIStatusBadge from './AIStatusBadge';

export default function AIIntradayStats({
  marketStatus = 'OPEN',
  aiStatus = 'READY',
  paperBalance = 100000,
  todayPnL = 0,
  todayTrades = 0,
  activePositions = 0,
  onAiStateChange,
}) {
  const isMarketOpen = (marketStatus || '').toUpperCase() === 'OPEN';

  const formattedBalance = typeof paperBalance === 'number'
    ? `₹${paperBalance.toLocaleString('en-IN')}`
    : paperBalance;

  const formattedPnL = typeof todayPnL === 'number'
    ? `${todayPnL >= 0 ? '+' : ''}₹${todayPnL.toLocaleString('en-IN')}`
    : todayPnL;

  const isPnLPositive = typeof todayPnL === 'number' ? todayPnL >= 0 : true;

  return (
    <div className="ai-stats-container mb-24">
      {/* Closed Market Notice Banner if applicable */}
      {!isMarketOpen && (
        <div
          className="mb-16"
          style={{
            padding: '10px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.82rem',
            color: '#F87171',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <div>
            <strong>MARKET CLOSED:</strong> Indian Stock Exchanges (NSE/BSE) are currently closed. The AI Scanner is displaying technical signals and scores based on the latest available market session data.
          </div>
        </div>
      )}

      <div className="grid-3 ai-stats-grid">
        {/* 1. Market Status Card */}
        <div className="card metric-card card-accent-gold flex-between" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              className="stat-icon-wrap"
              style={{
                background: isMarketOpen ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isMarketOpen ? 'var(--green)' : 'var(--red)',
              }}
            >
              <Activity size={22} />
            </div>
            <div>
              <div className="metric-label">Market Status</div>
              <div className="flex-row gap-8 mt-8" style={{ marginTop: '4px' }}>
                <span className={`status-dot ${isMarketOpen ? 'open' : 'closed'}`} />
                <span style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '0.5px' }}>
                  {isMarketOpen ? 'OPEN' : 'MARKET CLOSED'}
                </span>
              </div>
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>NSE / BSE</span>
        </div>

        {/* 2. AI Status Card */}
        <div className="card metric-card card-accent-blue flex-between" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="stat-icon-wrap" style={{ background: 'var(--neon-cyan-bg)', color: 'var(--neon-cyan)' }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="metric-label">AI Status</div>
              <div className="mt-8" style={{ marginTop: '6px' }}>
                <AIStatusBadge state={aiStatus} size="sm" />
              </div>
            </div>
          </div>
          {onAiStateChange && (
            <select
              className="select"
              value={aiStatus}
              onChange={(e) => onAiStateChange(e.target.value)}
              style={{ width: 'auto', padding: '4px 8px', fontSize: '0.7rem', height: 'auto' }}
              title="Test AI State"
            >
              <option value="READY">READY</option>
              <option value="ANALYSING">ANALYSING</option>
              <option value="RUNNING">RUNNING</option>
              <option value="STOPPED">STOPPED</option>
            </select>
          )}
        </div>

        {/* 3. Paper Balance Card */}
        <div className="card metric-card card-accent-gold flex-between" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="stat-icon-wrap" style={{ background: 'rgba(255, 215, 0, 0.12)', color: '#FFD700' }}>
              <Wallet size={22} />
            </div>
            <div>
              <div className="metric-label">Paper Balance</div>
              <div className="metric-value" style={{ fontSize: '1.35rem', textAlign: 'left', marginTop: '2px', color: 'var(--text-primary)' }}>
                {formattedBalance}
              </div>
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--green)', fontWeight: '700', background: 'var(--green-bg)', padding: '2px 8px', borderRadius: '10px' }}>Virtual</span>
        </div>

        {/* 4. Today's P&L Card */}
        <div className="card metric-card flex-between" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="stat-icon-wrap" style={{ background: isPnLPositive ? 'var(--green-bg)' : 'var(--red-bg)', color: isPnLPositive ? 'var(--green)' : 'var(--red)' }}>
              <DollarSign size={22} />
            </div>
            <div>
              <div className="metric-label">Today's P&L</div>
              <div className="metric-value" style={{ fontSize: '1.35rem', textAlign: 'left', marginTop: '2px', color: isPnLPositive ? 'var(--green)' : 'var(--red)' }}>
                {formattedPnL}
              </div>
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>0.00%</span>
        </div>

        {/* 5. Today's Trades Card */}
        <div className="card metric-card flex-between" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="stat-icon-wrap" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }}>
              <ArrowUpDown size={22} />
            </div>
            <div>
              <div className="metric-label">Today's Trades</div>
              <div className="metric-value" style={{ fontSize: '1.35rem', textAlign: 'left', marginTop: '2px' }}>
                {todayTrades}
              </div>
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Completed</span>
        </div>

        {/* 6. Active Positions Card */}
        <div className="card metric-card flex-between" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="stat-icon-wrap" style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-secondary)' }}>
              <Layers size={22} />
            </div>
            <div>
              <div className="metric-label">Active Positions</div>
              <div className="metric-value" style={{ fontSize: '1.35rem', textAlign: 'left', marginTop: '2px' }}>
                {activePositions}
              </div>
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Live</span>
        </div>
      </div>
    </div>
  );
}
