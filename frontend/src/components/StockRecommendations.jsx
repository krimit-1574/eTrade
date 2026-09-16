import { useState, useEffect, useCallback } from 'react';
import { 
  ChevronDown, ChevronUp, Flame, Gem, TrendingUp, TrendingDown, 
  RefreshCw, Eye, ShoppingCart, Target, ShieldAlert, Clock, 
  Zap, BarChart3, AlertTriangle, Bookmark, Info
} from 'lucide-react';
import { api } from '../api';

// ── Skeleton Loader ───────────────────────────────────────────────
function SkeletonBar() {
  return (
    <div className="reco-bar reco-skeleton">
      <div className="reco-bar-header">
        <div className="reco-bar-title">
          <div className="skeleton-pulse" style={{ width: '180px', height: '18px', borderRadius: '4px' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton-pulse" style={{ width: '90px', height: '28px', borderRadius: '14px' }} />
          ))}
        </div>
      </div>
      <div className="reco-bar-header" style={{ marginTop: '8px' }}>
        <div className="reco-bar-title">
          <div className="skeleton-pulse" style={{ width: '200px', height: '18px', borderRadius: '4px' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton-pulse" style={{ width: '90px', height: '28px', borderRadius: '14px' }} />
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'center', padding: '12px 0 4px', color: 'var(--neon-cyan)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <RefreshCw size={14} className="spin-anim" />
        AI is scanning 80+ NSE stocks for the best picks... This may take a minute.
      </div>
    </div>
  );
}

// ── Confidence Bar ────────────────────────────────────────────────
function ConfidenceBar({ value }) {
  const color = value >= 80 ? 'var(--green)' : value >= 60 ? 'var(--neon-cyan)' : value >= 40 ? '#F59E0B' : 'var(--red)';
  return (
    <div className="confidence-bar-wrap">
      <div className="confidence-bar-track">
        <div className="confidence-bar-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="confidence-bar-label" style={{ color }}>{value}%</span>
    </div>
  );
}

// ── Risk Badge ────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const config = {
    Low: { color: 'var(--green)', bg: 'var(--green-bg)', icon: ShieldAlert },
    Medium: { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', icon: AlertTriangle },
    High: { color: 'var(--red)', bg: 'var(--red-bg)', icon: AlertTriangle },
  };
  const c = config[level] || config.Medium;
  const Icon = c.icon;
  return (
    <span className="reco-risk-badge" style={{ color: c.color, background: c.bg, borderColor: c.color }}>
      <Icon size={11} /> {level} Risk
    </span>
  );
}

// ── Single Stock Card (Expanded) ──────────────────────────────────
function StockCard({ stock, type, onAnalyze, onTrade, onWatchlist }) {
  const isIntraday = type === 'intraday';
  const isPositive = stock.changePct >= 0;

  return (
    <div className="reco-stock-card">
      {/* Header */}
      <div className="reco-card-header">
        <div className="reco-card-symbol-wrap">
          <span className="reco-card-symbol">{stock.symbol?.replace('.NS', '')}</span>
          <span className="reco-card-name">{stock.name}</span>
        </div>
        <div className="reco-card-price-wrap">
          <span className="reco-card-price">₹{stock.currentPrice?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          <span className={`reco-card-change ${isPositive ? 'green' : 'red'}`}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isPositive ? '+' : ''}{stock.changePct?.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* AI Confidence */}
      <div className="reco-card-confidence">
        <span className="reco-card-label"><Zap size={12} /> AI Confidence</span>
        <ConfidenceBar value={stock.confidence || 0} />
      </div>

      {/* Reason */}
      <div className="reco-card-reason">
        <Info size={13} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--neon-cyan)' }} />
        <span>{stock.reason}</span>
      </div>

      {/* Key Metrics */}
      <div className="reco-card-metrics">
        {isIntraday ? (
          <>
            <div className="reco-metric">
              <span className="reco-metric-label">Target</span>
              <span className="reco-metric-value green">₹{stock.target?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="reco-metric">
              <span className="reco-metric-label">Stop Loss</span>
              <span className="reco-metric-value red">₹{stock.stopLoss?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="reco-metric">
              <span className="reco-metric-label">RSI</span>
              <span className="reco-metric-value">{stock.technicals?.rsi || 'N/A'}</span>
            </div>
            <div className="reco-metric">
              <span className="reco-metric-label">Vol Ratio</span>
              <span className="reco-metric-value">{stock.technicals?.volumeRatio || 'N/A'}x</span>
            </div>
          </>
        ) : (
          <>
            <div className="reco-metric">
              <span className="reco-metric-label">1Y Target</span>
              <span className="reco-metric-value green">₹{stock.target1Y?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="reco-metric">
              <span className="reco-metric-label">P/E</span>
              <span className="reco-metric-value">{stock.fundamentals?.pe || 'N/A'}</span>
            </div>
            <div className="reco-metric">
              <span className="reco-metric-label">ROE</span>
              <span className="reco-metric-value">{stock.fundamentals?.roe || 'N/A'}%</span>
            </div>
            <div className="reco-metric">
              <span className="reco-metric-label">D/E</span>
              <span className="reco-metric-value">{stock.fundamentals?.debtToEquity || 'N/A'}</span>
            </div>
          </>
        )}
      </div>

      {/* Badges Row */}
      <div className="reco-card-badges">
        <RiskBadge level={stock.riskLevel || 'Medium'} />
        <span className="reco-time-badge">
          <Clock size={11} /> {isIntraday ? 'Intraday' : stock.investmentHorizon || '1-3 Years'}
        </span>
        {stock.strategy && (
          <span className="reco-strategy-badge" title={stock.strategy}>
            <Target size={11} /> {stock.strategy}
          </span>
        )}
        {stock.catalysts && (
          <span className="reco-strategy-badge" title={stock.catalysts}>
            <Zap size={11} /> {stock.catalysts}
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="reco-card-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onTrade(stock.symbol)}>
          <ShoppingCart size={13} /> Paper Trade
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => onAnalyze(stock.symbol)}>
          <Eye size={13} /> Analyze
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onWatchlist(stock.symbol, stock.name)}>
          <Bookmark size={13} /> Watchlist
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function StockRecommendations({ user, onAnalyze, onTrade }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [intradayExpanded, setIntradayExpanded] = useState(false);
  const [longTermExpanded, setLongTermExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [watchlistMsg, setWatchlistMsg] = useState('');

  const fetchRecommendations = useCallback(async (force = false) => {
    if (force) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const result = force
        ? await api.refreshRecommendations(user?.user_id)
        : await api.getRecommendations(user?.user_id);
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load recommendations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const handleWatchlist = async (symbol, name) => {
    try {
      await api.toggleWatchlist(user?.user_id, symbol, name);
      setWatchlistMsg(`${symbol.replace('.NS', '')} watchlist updated!`);
      setTimeout(() => setWatchlistMsg(''), 2500);
    } catch {
      setWatchlistMsg('Sign in to use watchlist');
      setTimeout(() => setWatchlistMsg(''), 2500);
    }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Loading state
  if (loading) {
    return <SkeletonBar />;
  }

  // Error state
  if (error) {
    return (
      <div className="reco-bar reco-error">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', padding: '12px' }}>
          <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{error}</span>
          <button className="btn btn-outline btn-sm" onClick={() => fetchRecommendations()}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const intraday = data.intraday || [];
  const longTerm = data.longTerm || [];

  return (
    <div className="reco-bar">
      {/* Header with refresh */}
      <div className="reco-bar-top">
        <span className="reco-bar-ai-badge"><Zap size={12} /> AI Recommendations</span>
        <div className="reco-bar-top-right">
          {watchlistMsg && (
            <span style={{ fontSize: '0.7rem', color: 'var(--green)', marginRight: '8px' }}>{watchlistMsg}</span>
          )}
          {data.generatedAt && (
            <span className="reco-bar-timestamp">
              <Clock size={11} /> Updated {formatTime(data.generatedAt)}
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm reco-refresh-btn"
            onClick={() => fetchRecommendations(true)}
            disabled={refreshing}
            title="Refresh recommendations (re-scans market)"
          >
            <RefreshCw size={13} className={refreshing ? 'spin-anim' : ''} />
            {refreshing ? 'Scanning...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ─── Intraday Row ─── */}
      <div className="reco-section">
        <div className="reco-row" onClick={() => setIntradayExpanded(!intradayExpanded)}>
          <div className="reco-row-left">
            <span className="reco-row-icon reco-icon-intraday"><Flame size={15} /></span>
            <span className="reco-row-label">INTRADAY PICKS</span>
          </div>
          <div className="reco-row-tags">
            {intraday.map(s => (
              <span key={s.symbol} className="reco-tag reco-tag-intraday">
                {s.symbol?.replace('.NS', '')}
              </span>
            ))}
          </div>
          <button className="reco-expand-btn" title={intradayExpanded ? 'Collapse' : 'Expand details'}>
            {intradayExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Expanded Cards */}
        {intradayExpanded && (
          <div className="reco-expanded-grid">
            {intraday.map(stock => (
              <StockCard
                key={stock.symbol}
                stock={stock}
                type="intraday"
                onAnalyze={onAnalyze}
                onTrade={onTrade}
                onWatchlist={handleWatchlist}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Long-Term Row ─── */}
      <div className="reco-section">
        <div className="reco-row" onClick={() => setLongTermExpanded(!longTermExpanded)}>
          <div className="reco-row-left">
            <span className="reco-row-icon reco-icon-longterm"><Gem size={15} /></span>
            <span className="reco-row-label">LONG-TERM PICKS</span>
          </div>
          <div className="reco-row-tags">
            {longTerm.map(s => (
              <span key={s.symbol} className="reco-tag reco-tag-longterm">
                {s.symbol?.replace('.NS', '')}
              </span>
            ))}
          </div>
          <button className="reco-expand-btn" title={longTermExpanded ? 'Collapse' : 'Expand details'}>
            {longTermExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Expanded Cards */}
        {longTermExpanded && (
          <div className="reco-expanded-grid">
            {longTerm.map(stock => (
              <StockCard
                key={stock.symbol}
                stock={stock}
                type="longTerm"
                onAnalyze={onAnalyze}
                onTrade={onTrade}
                onWatchlist={handleWatchlist}
              />
            ))}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      {(intradayExpanded || longTermExpanded) && data.disclaimer && (
        <div className="reco-disclaimer">
          <AlertTriangle size={12} />
          <span>{data.disclaimer}</span>
        </div>
      )}
    </div>
  );
}
