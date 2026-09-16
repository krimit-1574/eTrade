import React, { useState } from 'react';
import { Search, Sparkles, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import IntradayOpportunityRow from './IntradayOpportunityRow';

export default function IntradayOpportunityTable({
  opportunities = [],
  isLoading = false,
  lastAnalysed = '',
  marketStatus = 'OPEN',
  dataSource = '',
  isFallback = false,
  error = null,
  onRefresh,
  onStartAI,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [biasFilter, setBiasFilter] = useState('ALL');

  const filteredOpportunities = opportunities.filter((item) => {
    const matchesSearch =
      (item.sym || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesBias =
      biasFilter === 'ALL' ? true : (item.bias || '').toUpperCase() === biasFilter.toUpperCase();

    return matchesSearch && matchesBias;
  });

  return (
    <div className="card intraday-opportunities-card" style={{ padding: '0', overflow: 'hidden' }}>
      {/* Table Header Controls */}
      <div
        className="flex-between"
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(0, 0, 0, 0.2)',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={20} style={{ color: 'var(--neon-cyan)' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0 }}>
                Top 10 AI Intraday Opportunities
              </h2>
              {lastAnalysed && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                  }}
                >
                  <Clock size={11} /> Last analysed: {lastAnalysed}
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
              Scanned from NSE India stock universe using multi-factor technical scoring ({dataSource || 'Real Market Data'})
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Bias Filter Pills */}
          <div className="filter-pill-group" style={{ display: 'flex', gap: '4px' }}>
            {['ALL', 'LONG', 'SHORT', 'WAIT'].map((bias) => (
              <button
                key={bias}
                className={`filter-btn ${biasFilter === bias ? 'active' : ''}`}
                onClick={() => setBiasFilter(bias)}
              >
                {bias}
              </button>
            ))}
          </div>

          {/* Refresh Analysis Button */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={onRefresh}
            title="Refresh Intraday Scanner Analysis"
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'spin-anim' : ''} />
            <span>{isLoading ? 'Analysing...' : 'Refresh Analysis'}</span>
          </button>
        </div>
      </div>

      {/* Fallback or Market Status Banner if applicable */}
      {(isFallback || error) && (
        <div
          style={{
            padding: '10px 20px',
            background: 'rgba(245, 158, 11, 0.1)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.78rem',
            color: '#F59E0B',
          }}
        >
          <AlertCircle size={15} />
          <span>
            {error?.message || 'Backend market service offline. Displaying fallback dataset.'} Click "Refresh Analysis" to re-scan.
          </span>
        </div>
      )}

      {/* Search Bar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(10, 10, 15, 0.5)' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type="text"
            className="input"
            placeholder="Filter opportunities by stock symbol or company name (e.g. RELIANCE, TCS, INFY)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              paddingLeft: '38px',
              height: '38px',
              fontSize: '0.85rem',
              background: 'rgba(0, 0, 0, 0.3)',
            }}
          />
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
        </div>
      </div>

      {/* Table & Loading Overlay */}
      <div className="table-responsive" style={{ overflowX: 'auto', position: 'relative', minHeight: '300px' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(5, 5, 8, 0.82)',
              backdropFilter: 'blur(4px)',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}
          >
            <div className="spinner" />
            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--neon-cyan)', letterSpacing: '0.5px' }}>
              AI is analysing today's market opportunities...
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Calculating OHLC, VWAP, RSI, RVOL, and 6-factor AI Scores
            </span>
          </div>
        )}

        <table className="intraday-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '60px' }}>Rank</th>
              <th>Stock Symbol</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>Day Change</th>
              <th style={{ textAlign: 'right' }}>High</th>
              <th style={{ textAlign: 'right' }}>Low</th>
              <th style={{ textAlign: 'right' }}>Volume</th>
              <th style={{ textAlign: 'center' }}>RVOL</th>
              <th>Trend</th>
              <th style={{ textAlign: 'center' }}>AI Score</th>
              <th style={{ textAlign: 'center' }}>Confidence</th>
              <th style={{ textAlign: 'center' }}>Bias</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredOpportunities.map((item) => (
              <IntradayOpportunityRow
                key={item.sym || item.rank}
                item={item}
                onStartAI={onStartAI}
              />
            ))}
            {!isLoading && filteredOpportunities.length === 0 && (
              <tr>
                <td colSpan="13" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No intraday opportunities match your current filter. Try clearing your search query.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
