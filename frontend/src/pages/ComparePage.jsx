import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { api } from '../api';

const METRICS = [
  { label: 'ROE', key: 'roe' },
  { label: 'P/E', key: 'pe' },
  { label: 'Market Cap', key: 'mktCap' },
  { label: 'Dividend Yield', key: 'divYield' },
  { label: 'Revenue Growth', key: 'revGrowth' },
  { label: 'Margin', key: 'margin' },
  { label: 'EPS', key: 'eps' },
  { label: 'Debt to Equity', key: 'dte' },
];

export default function ComparePage({ user }) {
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleCompare = async () => {
    if (!s1.trim() || !s2.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.compare(user.user_id, s1, s2);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {loading && (
        <div className="spinner-overlay">
          <div className="spinner" />
          <div className="spinner-text">Comparing {s1} vs {s2}...</div>
        </div>
      )}

      <div className="page-header">
        <h1>Stock <span className="gold-text">Comparison</span></h1>
        <p>Side-by-side AI analysis of two stocks.</p>
      </div>

      <div className="grid-2 mb-24" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <label className="input-label">First Stock</label>
          <input className="input" placeholder="e.g. Reliance" value={s1} onChange={(e) => setS1(e.target.value)} id="compare-s1" />
        </div>
        <div>
          <label className="input-label">Second Stock</label>
          <input className="input" placeholder="e.g. TCS" value={s2} onChange={(e) => setS2(e.target.value)} id="compare-s2" />
        </div>
      </div>
      <button className="btn btn-primary mb-24" onClick={handleCompare} id="compare-btn">
        <BarChart3 size={16} /> Compare →
      </button>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          {/* Score Cards */}
          <div className="grid-2 mb-24">
            <div className="card metric-card card-accent-gold">
              <h3 style={{ marginBottom: '4px' }}>{result.stock1.companyName}</h3>
              <span className="tag tag-gold" style={{ marginBottom: '12px' }}>{result.stock1.symbol}</span>
              <div className="metric-value" style={{ color: result.stock1.aiScore >= 70 ? 'var(--green)' : result.stock1.aiScore >= 50 ? 'var(--gold)' : 'var(--red)' }}>
                {result.stock1.aiScore}/100
              </div>
              <div className="metric-label">AI Score</div>
            </div>
            <div className="card metric-card card-accent-blue">
              <h3 style={{ marginBottom: '4px' }}>{result.stock2.companyName}</h3>
              <span className="tag tag-gold" style={{ marginBottom: '12px' }}>{result.stock2.symbol}</span>
              <div className="metric-value" style={{ color: result.stock2.aiScore >= 70 ? 'var(--green)' : result.stock2.aiScore >= 50 ? 'var(--gold)' : 'var(--red)' }}>
                {result.stock2.aiScore}/100
              </div>
              <div className="metric-label">AI Score</div>
            </div>
          </div>

          {/* Metrics Table */}
          <div className="card">
            <h4 style={{ marginBottom: '16px' }}>Metrics Comparison</h4>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Table header */}
              <div className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
                <span style={{ flex: 2, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Metric</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '1px' }}>{result.stock1.symbol}</span>
                <span style={{ flex: 1, textAlign: 'right', fontSize: '0.7rem', fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '1px' }}>{result.stock2.symbol}</span>
              </div>
              {METRICS.map(({ label, key }, i) => (
                <motion.div
                  key={key}
                  className="flex-between"
                  style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <span style={{ flex: 2, fontSize: '0.85rem', fontWeight: 600 }}>{label}</span>
                  <span style={{ flex: 1, textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {result.stock1.financials?.[key] || 'N/A'}
                  </span>
                  <span style={{ flex: 1, textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {result.stock2.financials?.[key] || 'N/A'}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
