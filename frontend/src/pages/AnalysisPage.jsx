import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Download, TrendingUp, TrendingDown, AlertTriangle, Shield, Target, Clock, Zap, CheckCircle2, XCircle, Sparkles, Activity, Star, ShoppingCart } from 'lucide-react';
import { api } from '../api';
import CandlestickChart from '../components/CandlestickChart.jsx';

const TABS = ['Overview', 'AI Advisor', 'Bull Case', 'Bear Case', 'Financials', 'Holdings', 'Advice'];

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 },
};
const Motion = motion;

export default function AnalysisPage({ user, initialQuery = '', onTrade }) {
  const [query, setQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasAutoAnalyzed, setHasAutoAnalyzed] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [livePrice, setLivePrice] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [chartPeriod, setChartPeriod] = useState('1d'); // Default to Current Day 1D Intraday
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    if (query.trim().length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchSymbols(query);
        setSearchResults(res.results || []);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleAnalyze = useCallback(async (queryToAnalyze = query) => {
    if (!queryToAnalyze.trim()) return;
    setShowDropdown(false);
    setError('');
    setLoading(true);
    setData(null);
    setChartData([]);
    setLivePrice(null);
    try {
      const result = await api.analyze(user.user_id, queryToAnalyze);
      setData(result);
      setActiveTab(0);

      const targetSym = result.symbol || queryToAnalyze;
      if (targetSym) {
        const [histRes, priceRes, favRes] = await Promise.allSettled([
          api.getHistory(targetSym, chartPeriod),
          api.getPrice(targetSym),
          api.checkWatchlist(user.user_id, targetSym),
        ]);
        if (histRes.status === 'fulfilled') setChartData(histRes.value.data || []);
        if (priceRes.status === 'fulfilled' && priceRes.value.price !== 'N/A') setLivePrice(priceRes.value);
        if (favRes.status === 'fulfilled') setIsFav(favRes.value.is_in_watchlist);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch stock analysis');
    } finally {
      setLoading(false);
    }
  }, [chartPeriod, query, user.user_id]);

  const handleToggleFav = async () => {
    if (!data?.symbol) return;
    try {
      const res = await api.toggleWatchlist(user.user_id, data.symbol, data.companyName);
      setIsFav(res.is_in_watchlist);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (initialQuery && initialQuery.trim() !== '' && !hasAutoAnalyzed) {
      setHasAutoAnalyzed(true);
      setQuery(initialQuery);
      handleAnalyze(initialQuery);
    }
  }, [initialQuery, hasAutoAnalyzed, handleAnalyze]);

  const handleChartPeriod = async (period) => {
    setChartPeriod(period);
    const targetSym = data?.symbol || query;
    if (targetSym) {
      try {
        const res = await api.getHistory(targetSym, period);
        setChartData(res.data || []);
      } catch { /* ignore */ }
    }
  };

  const handleExportPdf = async () => {
    if (!data) return;
    try {
      const blob = await api.exportPdf(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.symbol}_report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to export PDF');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAnalyze();
  };

  const score = data?.aiScore || 0;
  const scoreColor = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--gold)' : 'var(--red)';

  const quantAnalysis = data?.quantAnalysis;
  const quantScore = quantAnalysis?.score || 'N/A';
  const quantScoreNum = parseInt(quantScore) || 0;
  const quantScoreColor = quantScore === 'N/A' ? 'var(--text-muted)' : (quantScoreNum >= 55 ? 'var(--green)' : quantScoreNum >= 45 ? 'var(--gold)' : 'var(--red)');

  // Bullish vs Bearish Run Scale
  const bullishPct = quantAnalysis?.bullishPct || data?.bullishPct || (score >= 60 ? Math.min(88, score + 5) : 42);
  const bearishPct = quantAnalysis?.bearishPct || data?.bearishPct || (100 - bullishPct);

  return (
    <div>
      {/* Loading overlay */}
      {loading && (
        <div className="spinner-overlay">
          <div className="spinner" />
          <div className="spinner-text">Scanning and Analyzing {query}...</div>
        </div>
      )}

      <div className="page-header">
        <h1>Rese<span className="gold-text">arch & AI Scan</span></h1>
        <p>Search ANY stock of India or world for real-time pricing, intraday candlestick chart, run scale & AI decision scan.</p>
      </div>

      {/* Search Input */}
      <div className="search-bar" style={{ position: 'relative' }}>
        <input
          className="input"
          placeholder="Search ANY stock (e.g. ZOMATO, SUZLON, TATAMOTORS, RELIANCE.NS, TSLA)..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.trim().length > 0) setShowDropdown(true); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          id="analysis-search"
        />
        <button className="btn btn-primary" onClick={() => handleAnalyze()} id="analysis-btn">
          <Search size={16} /> Analyse Stock
        </button>
        {showDropdown && searchResults.length > 0 && (
          <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', zIndex: 10, padding: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {searchResults.map((s, i) => (
              <div 
                key={i} 
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => {
                  setQuery(s.symbol);
                  setShowDropdown(false);
                  handleAnalyze(s.symbol);
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-lighter)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.symbol}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.name}</div>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--neon-cyan)', textTransform: 'uppercase', letterSpacing: '1px' }}>{s.exchange}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {data && (
        <AnimatePresence>
          <Motion.div {...fadeUp}>
            {/* Header / Price Display */}
            <div>
              <div className="flex-row gap-8 mb-16" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '2.4rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-1px' }}>{data.companyName}</h2>
                <span className="tag tag-gold">{data.symbol}</span>
                {data.exchange && <span className="tag tag-gold">{data.exchange}</span>}
                {user.user_id !== 'guest' && (
                  <button
                    className={`btn btn-sm ${isFav ? 'btn-primary' : 'btn-outline'}`}
                    onClick={handleToggleFav}
                    title={isFav ? 'Remove from watchlist' : 'Add to watchlist'}
                  >
                    <Star size={14} fill={isFav ? 'currentColor' : 'none'} /> {isFav ? 'Watching' : 'Watch'}
                  </button>
                )}
                {onTrade && data.symbol && (
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => onTrade(data.symbol)}
                    title="Open paper trading for this stock"
                  >
                    <ShoppingCart size={14} /> Paper Trade
                  </button>
                )}
              </div>
              <p style={{ fontSize: '0.95rem', color: 'var(--neon-cyan)' }}>
                <strong>{data.sector}</strong> · {data.financials?.mktCap || 'Market Cap N/A'}
              </p>
              <p style={{ fontSize: '0.85rem', marginTop: '8px', color: 'var(--text-secondary)', maxWidth: '850px' }}>
                {data.description}
              </p>
              {livePrice && (
                <div className="flex-row gap-8 mt-16" style={{ alignItems: 'baseline' }}>
                  <span style={{ fontSize: '2.2rem', fontWeight: 800, textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>
                    {data.symbol?.endsWith('.NS') || data.symbol?.endsWith('.BO') ? '₹' : '$'}{livePrice.price}
                  </span>
                  <span className={`tag ${parseFloat(livePrice.change) >= 0 ? 'tag-green' : 'tag-red'}`} style={{ fontSize: '0.9rem', padding: '4px 10px' }}>
                    {parseFloat(livePrice.change) >= 0 ? '▲ +' : '▼ '}{livePrice.change} ({Math.abs(parseFloat(livePrice.pct))}%)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Real-Time Price</span>
                </div>
              )}
            </div>

            {/* AI Investment Recommendation & Scan Summary Cards */}
            <div className="mt-24 mb-24">
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} style={{ color: 'var(--gold)' }} /> AI Stock Scan & Investment Advisor
              </h3>
              
              <div className="grid-2 gap-16">
                {/* 1. Invest or Wait? */}
                <div className={`card ${data.investOrWait?.action === 'INVEST' ? 'card-accent-green' : data.investOrWait?.action === 'WAIT' ? 'card-accent-gold' : 'card-accent-red'}`}>
                  <div className="flex-between mb-8">
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>1. Action Recommendation</span>
                    <span className={`tag ${data.investOrWait?.action === 'INVEST' ? 'tag-green' : data.investOrWait?.action === 'WAIT' ? 'tag-gold' : 'tag-red'}`}>
                      {data.investOrWait?.recommendation || (data.advice?.add ? 'INVEST NOW' : 'WAIT / HOLD')}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>
                    {data.investOrWait?.action === 'INVEST' ? '🎯 Recommended to Invest' : data.investOrWait?.action === 'WAIT' ? '⏳ Wait for Better Entry' : '⚠️ Avoid / High Risk'}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {data.investOrWait?.reasoning || data.advice?.reasoning}
                  </p>
                </div>

                {/* 2. Good Stock or Bad Stock? */}
                <div className={`card ${data.stockQuality?.verdict?.includes('GOOD') ? 'card-accent-green' : 'card-accent-red'}`}>
                  <div className="flex-between mb-8">
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>2. Business Quality</span>
                    <span className={`tag ${data.stockQuality?.verdict?.includes('GOOD') ? 'tag-green' : 'tag-red'}`}>
                      {data.stockQuality?.rating || (score >= 60 ? 'Good Quality Stock' : 'Weak / High Risk')}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>
                    {data.stockQuality?.verdict?.includes('GOOD') || score >= 60 ? '💎 Fundamental Quality: GOOD' : '❌ Fundamental Quality: WEAK'}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {data.stockQuality?.details || `Overall AI Quality Score: ${score}/100 based on balance sheet, ROE, growth, and governance.`}
                  </p>
                </div>

                {/* 3. Current Scenario Good or Bad? */}
                <div className={`card ${data.currentScenario?.verdict?.includes('GOOD') || quantScoreNum >= 50 ? 'card-accent-blue' : 'card-accent-gold'}`}>
                  <div className="flex-between mb-8">
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>3. Current Market Setup</span>
                    <span className="tag tag-gold">
                      {data.currentScenario?.status || (quantScoreNum >= 50 ? 'Favorable Setup' : 'Volatile / Cautious')}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>
                    {data.currentScenario?.verdict?.includes('GOOD') || quantScoreNum >= 50 ? '⚡ Current Scenario: FAVORABLE' : '⚡ Current Scenario: UNFAVORABLE'}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {data.currentScenario?.details || `Quant technical trend score is ${quantScore}/100. Price momentum and market setup evaluated.`}
                  </p>
                </div>

                {/* 4. Long-Term Suitability */}
                <div className={`card ${data.longTermSuitability?.verdict?.includes('GOOD') || score >= 65 ? 'card-accent-green' : 'card-accent-gold'}`}>
                  <div className="flex-between mb-8">
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>4. Long-Term Investment</span>
                    <span className={`tag ${data.longTermSuitability?.verdict?.includes('GOOD') || score >= 65 ? 'tag-green' : 'tag-gold'}`}>
                      {data.longTermSuitability?.suitability || (score >= 65 ? 'Good for Long-Term' : 'Short-Term Trading Only')}
                    </span>
                  </div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>
                    {data.longTermSuitability?.verdict?.includes('GOOD') || score >= 65 ? '⏳ Long-Term Holding: RECOMMENDED' : '⏳ Long-Term Holding: NOT RECOMMENDED'}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {data.longTermSuitability?.details || `Suggested horizon: ${data.advice?.horizon || '3-5 years'}. Position size recommendation: ${data.advice?.position || '3-5%'}.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Candlestick Chart Window */}
            {chartData.length > 0 && (
              <Motion.div className="mt-24" style={{ position: 'relative' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                
                {/* Floating Glass Score Overlay */}
                <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, display: 'flex', gap: '12px' }}>
                  <Motion.div
                    initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 }}
                    className="card" style={{ padding: '12px 16px', background: 'rgba(10,10,15,0.75)', backdropFilter: 'blur(10px)', borderLeft: `4px solid ${scoreColor}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="score-circle" style={{ '--score': score, width: '54px', height: '54px' }}>
                      <span className="score-num" style={{ fontSize: '1.1rem', color: scoreColor }}>{score}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI Fundamental</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: scoreColor }}>Quality Score</div>
                    </div>
                  </Motion.div>

                  {quantAnalysis && !quantAnalysis.error && (
                    <Motion.div
                      initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5 }}
                      className="card" style={{ padding: '12px 16px', background: 'rgba(10,10,15,0.75)', backdropFilter: 'blur(10px)', borderLeft: `4px solid ${quantScoreColor}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="score-circle" style={{ '--score': quantScoreNum, width: '54px', height: '54px' }}>
                        <span className="score-num" style={{ fontSize: '1.1rem', color: quantScoreColor }}>{quantScore}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Quant Technical</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: quantScoreColor }}>Trend Score</div>
                      </div>
                    </Motion.div>
                  )}
                </div>

                {/* Period Buttons */}
                <div className="flex-between mb-16" style={{ position: 'absolute', top: '16px', right: '20px', zIndex: 10 }}>
                  <div className="flex-row gap-6" style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '8px', backdropFilter: 'blur(10px)' }}>
                    {[
                      { id: '1d', label: '1D (Today)' },
                      { id: '5d', label: '5D' },
                      { id: '1mo', label: '1M' },
                      { id: '3mo', label: '3M' },
                      { id: '1y', label: '1Y' },
                      { id: '5y', label: '5Y' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        className={`btn btn-sm ${chartPeriod === p.id ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: chartPeriod === p.id ? 700 : 500 }}
                        onClick={() => handleChartPeriod(p.id)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main Candlestick Chart */}
                <div className="card" style={{ padding: '16px 16px 0 16px', background: 'rgba(12,12,18,0.9)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Candlestick Chart ({chartPeriod === '1d' ? 'Current Day 5-Min Intraday' : chartPeriod.toUpperCase()})
                    </span>
                  </div>
                  <CandlestickChart data={chartData} />
                </div>

                {/* Bearish vs Bullish Run Scale (Placed Beneath Chart) */}
                <div className="card card-accent-gold mt-16" style={{ background: 'linear-gradient(135deg, rgba(20,20,30,0.95), rgba(15,15,25,0.95))' }}>
                  <div className="flex-between mb-12">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Activity size={18} style={{ color: 'var(--neon-cyan)' }} />
                      <h4 style={{ fontSize: '1rem', margin: 0 }}>Bearish vs Bullish Run Scale</h4>
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: bullishPct >= 50 ? 'var(--green)' : 'var(--red)' }}>
                      {bullishPct >= 50 ? `🟢 ${bullishPct}% Bullish Dominance` : `🔴 ${bearishPct}% Bearish Pressure`}
                    </span>
                  </div>

                  {/* Dual Scale Bar */}
                  <div style={{ height: '24px', borderRadius: '12px', overflow: 'hidden', background: '#1F2937', display: 'flex', position: 'relative', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
                    <div 
                      style={{ 
                        width: `${bullishPct}%`, 
                        background: 'linear-gradient(90deg, #059669, #10B981)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'flex-start',
                        paddingLeft: '12px',
                        color: '#FFF',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        transition: 'width 0.5s ease-in-out'
                      }}
                    >
                      BULLISH {bullishPct}%
                    </div>
                    <div 
                      style={{ 
                        width: `${bearishPct}%`, 
                        background: 'linear-gradient(90deg, #EF4444, #DC2626)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'flex-end',
                        paddingRight: '12px',
                        color: '#FFF',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        transition: 'width 0.5s ease-in-out'
                      }}
                    >
                      BEARISH {bearishPct}%
                    </div>
                  </div>

                  {/* Technical Indicator Badges */}
                  {quantAnalysis?.signals && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
                      {quantAnalysis.signals.map((sig, idx) => (
                        <span 
                          key={idx} 
                          className={`tag ${sig.bias.includes('Bullish') ? 'tag-green' : sig.bias.includes('Bearish') ? 'tag-red' : 'tag-gold'}`}
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        >
                          <strong>{sig.indicator}:</strong> {sig.bias}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Motion.div>
            )}

            {/* Detailed Analysis Tabs */}
            <div className="tabs mt-24">
              {TABS.map((t, i) => (
                <button key={t} className={`tab ${activeTab === i ? 'active' : ''}`} onClick={() => setActiveTab(i)}>
                  {t}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              <Motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {activeTab === 0 && <OverviewTab data={data} />}
                {activeTab === 1 && <AIAdvisorTab data={data} />}
                {activeTab === 2 && <CaseTab items={data.bullCase} type="bull" />}
                {activeTab === 3 && <CaseTab items={data.bearCase} type="bear" />}
                {activeTab === 4 && <FinancialsTab data={data.financials} quarterly={data.quarterly} />}
                {activeTab === 5 && <HoldingsTab data={data} />}
                {activeTab === 6 && <AdviceTab data={data.advice} />}
              </Motion.div>
            </AnimatePresence>

            {/* Export PDF */}
            <div style={{ marginTop: '32px' }}>
              <button className="btn btn-outline" onClick={handleExportPdf} id="export-pdf-btn">
                <Download size={16} /> Export PDF Report
              </button>
            </div>
          </Motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function OverviewTab({ data }) {
  const quantAnalysis = data?.quantAnalysis;
  
  return (
    <div>
      {quantAnalysis && !quantAnalysis.error && (
        <div className="card card-accent-blue mb-24" style={{ background: 'var(--neon-purple-bg)' }}>
          <h4 style={{ marginBottom: '16px', color: 'var(--neon-purple)' }}>Quantitative Machine Learning Drivers</h4>
          <p style={{ fontSize: '0.85rem', marginBottom: '12px', color: 'var(--text-primary)' }}>
            Model trained on technical indicators, moving averages, and volatility bands:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {quantAnalysis.reasoning?.map((r, i) => (
              <div key={i} style={{ fontSize: '0.85rem', paddingLeft: '8px', borderLeft: '2px solid var(--neon-cyan)', color: 'var(--text-secondary)' }}>
                {r}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="grid-2 mb-24">
        <div className="card card-accent-gold">
          <h4 style={{ marginBottom: '16px' }}>Score Breakdown</h4>
          {data.scoreBreak && Object.entries(data.scoreBreak).map(([k, v]) => (
            <div key={k} style={{ marginBottom: '12px' }}>
              <div className="flex-between" style={{ marginBottom: '4px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize' }}>{k}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>{v}/100</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${v}%` }} />
              </div>
            </div>
          ))}
          <p style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '12px' }}>{data.scoreReason}</p>
        </div>

        <div className="card card-accent-red">
          <h4 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} style={{ color: 'var(--red)' }} /> Red Flags & Governance Risk
          </h4>
          {data.redFlags?.filter(Boolean).length > 0 ? (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.redFlags.filter(Boolean).map((f, i) => (
                <li key={i} style={{ fontSize: '0.85rem', color: 'var(--red)', paddingLeft: '12px', borderLeft: '2px solid var(--red)' }}>
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <div className="success-banner">✓ No major red flags identified</div>
          )}
        </div>
      </div>

      {data.quarterly && (
        <div className="card card-accent-gold">
          <h4 style={{ marginBottom: '16px' }}>Latest Quarterly Results</h4>
          <div className="grid-3 mb-16">
            <div className="card metric-card"><div className="metric-value">{data.quarterly.revenue}</div><div className="metric-label">Revenue</div></div>
            <div className="card metric-card"><div className="metric-value">{data.quarterly.netProfit}</div><div className="metric-label">Net Profit</div></div>
            <div className="card metric-card"><div className="metric-value">{data.quarterly.quarter}</div><div className="metric-label">Quarter</div></div>
          </div>
          <p style={{ fontSize: '0.85rem' }}>{data.quarterly.summary}</p>
        </div>
      )}
    </div>
  );
}

function AIAdvisorTab({ data }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card card-accent-green">
        <h4>🎯 1. Invest or Wait Decision</h4>
        <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>
          <strong>Recommendation:</strong> {data.investOrWait?.recommendation || (data.advice?.add ? 'INVEST NOW' : 'WAIT / HOLD')}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {data.investOrWait?.reasoning || data.advice?.reasoning}
        </p>
      </div>

      <div className="card card-accent-gold">
        <h4>💎 2. Stock Quality Assessment</h4>
        <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>
          <strong>Rating:</strong> {data.stockQuality?.rating || 'Evaluated Quality'}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {data.stockQuality?.details || data.scoreReason}
        </p>
      </div>

      <div className="card card-accent-blue">
        <h4>⚡ 3. Current Market Scenario</h4>
        <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>
          <strong>Scenario Status:</strong> {data.currentScenario?.status || 'Active Market Setup'}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {data.currentScenario?.details || 'Current price action and technical setup evaluated.'}
        </p>
      </div>

      <div className="card card-accent-green">
        <h4>⏳ 4. Long-Term Investment Suitability</h4>
        <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>
          <strong>Verdict:</strong> {data.longTermSuitability?.suitability || 'Long Term Evaluation'}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          {data.longTermSuitability?.details || `Recommended horizon: ${data.advice?.horizon || 'Long term'}`}
        </p>
      </div>
    </div>
  );
}

function CaseTab({ items, type }) {
  const Icon = type === 'bull' ? TrendingUp : TrendingDown;
  const accent = type === 'bull' ? 'card-accent-green' : 'card-accent-red';
  const iconColor = type === 'bull' ? 'var(--green)' : 'var(--red)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {items?.map((item, i) => (
        <Motion.div key={i} className={`card ${accent}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Icon size={18} style={{ color: iconColor }} /> {item.title}
          </h4>
          <p style={{ fontSize: '0.85rem' }}>{item.detail}</p>
        </Motion.div>
      ))}
    </div>
  );
}

function FinancialsTab({ data, quarterly: _quarterly }) {
  if (!data) return null;
  const entries = Object.entries(data);
  return (
    <div className="grid-3">
      {entries.map(([k, v]) => (
        <div key={k} className="card metric-card">
          <div className="metric-value">{v || 'N/A'}</div>
          <div className="metric-label">{k}</div>
        </div>
      ))}
    </div>
  );
}

function HoldingsTab({ data }) {
  return (
    <div className="grid-2">
      <div className="card card-accent-gold">
        <h4 style={{ marginBottom: '16px' }}>Shareholding Pattern</h4>
        {data.shareholding && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {['promoter', 'fii', 'dii', 'public'].map((k) => (
              <div key={k} className="flex-between">
                <span style={{ fontSize: '0.85rem', textTransform: 'capitalize', fontWeight: 500 }}>{k}</span>
                <span className="tag tag-gold">{data.shareholding[k]}</span>
              </div>
            ))}
            <p style={{ fontSize: '0.8rem', fontStyle: 'italic', marginTop: '8px', color: 'var(--text-muted)' }}>
              {data.shareholding.recentChange}
            </p>
          </div>
        )}
      </div>
      <div className="card card-accent-blue">
        <h4 style={{ marginBottom: '16px' }}>Management Commentary</h4>
        <p style={{ fontSize: '0.85rem', lineHeight: '1.7', fontStyle: 'italic' }}>
          "{data.mgmtCommentary}"
        </p>
      </div>
    </div>
  );
}

function AdviceTab({ data }) {
  if (!data) return null;
  const isAdd = data.add;
  return (
    <div className={`card ${isAdd ? 'card-accent-green' : 'card-accent-red'}`}>
      <h4 style={{ marginBottom: '16px' }}>Portfolio Recommendation</h4>
      <span className={`tag ${isAdd ? 'tag-green' : 'tag-red'}`} style={{ fontSize: '0.8rem', padding: '6px 16px' }}>
        {isAdd ? '✓ RECOMMENDED TO ADD' : '✗ AVOID / HOLD OFF'}
      </span>
      <p style={{ fontSize: '0.85rem', marginTop: '16px' }}>{data.reasoning}</p>
      <div className="grid-2 mt-16">
        <div className="card metric-card">
          <Target size={20} style={{ color: 'var(--gold)', margin: '0 auto 8px' }} />
          <div className="metric-value" style={{ fontSize: '1rem' }}>{data.position}</div>
          <div className="metric-label">Suggested Position</div>
        </div>
        <div className="card metric-card">
          <Clock size={20} style={{ color: 'var(--gold)', margin: '0 auto 8px' }} />
          <div className="metric-value" style={{ fontSize: '1rem' }}>{data.horizon}</div>
          <div className="metric-label">Time Horizon</div>
        </div>
      </div>
    </div>
  );
}
