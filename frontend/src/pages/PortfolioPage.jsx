import { useState, useEffect, useCallback } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Briefcase } from 'lucide-react';
import { api } from '../api';

export default function PortfolioPage({ user }) {
  const [portfolio, setPortfolio] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', symbol: '', quantity: '', buy_price: '' });
  const [error, setError] = useState('');
  const isGuest = user?.user_id === 'guest';

  const fetchPortfolio = useCallback(async () => {
    if (!user?.user_id || isGuest) return;
    try {
      const res = await api.getPortfolio(user.user_id);
      setPortfolio(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err.message || 'Failed to load portfolio.');
    }
  }, [isGuest, user?.user_id]);

  useEffect(() => { void fetchPortfolio(); }, [fetchPortfolio]);

  const total = portfolio.reduce((sum, holding) => {
    const quantity = Number(holding.quantity);
    const buyPrice = Number(holding.buy_price);
    return Number.isFinite(quantity) && Number.isFinite(buyPrice)
      ? sum + (quantity * buyPrice)
      : sum;
  }, 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    if (isGuest) {
      setError('Please sign in to manage a portfolio.');
      return;
    }
    if (!form.name || !form.symbol || !form.quantity || !form.buy_price) {
      setError('Please fill in all fields.');
      return;
    }
    const parsedQuantity = Number(form.quantity);
    const parsedBuyPrice = Number(form.buy_price);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isFinite(parsedBuyPrice) || parsedBuyPrice <= 0) {
      setError('Quantity and buy price must both be positive numbers.');
      return;
    }
    try {
      await api.addPortfolio(
        user.user_id,
        form.name.trim(),
        form.symbol.trim().toUpperCase(),
        parsedQuantity,
        parsedBuyPrice,
      );
      setForm({ name: '', symbol: '', quantity: '', buy_price: '' });
      setShowForm(false);
      await fetchPortfolio();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (pid) => {
    try {
      await api.removePortfolio(pid, user.user_id);
      await fetchPortfolio();
    } catch (err) {
      setError(err.message || 'Failed to remove holding.');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>My <span className="gold-text">Portfolio</span></h1>
        <p>Track your investments in one place.</p>
      </div>

      <div className="flex-between mb-24">
        <div className="card card-accent-gold" style={{ padding: '16px 24px' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Invested</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--gold)' }}>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} id="portfolio-add-btn" disabled={isGuest}>
          <Plus size={16} /> Add Holding
        </button>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {showForm && (
          <Motion.div
            className="card mb-24"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <h4 style={{ marginBottom: '16px' }}>Add New Holding</h4>
            {error && <div className="error-banner">{error}</div>}
            <form onSubmit={handleAdd}>
              <div className="grid-4 mb-16">
                <div>
                  <label className="input-label">Name</label>
                  <input className="input" placeholder="e.g. Apple Inc" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="input-label">Symbol</label>
                  <input className="input" placeholder="e.g. AAPL" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
                </div>
                <div>
                  <label className="input-label">Quantity</label>
                  <input className="input" type="number" step="any" placeholder="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div>
                  <label className="input-label">Buy Price (₹)</label>
                  <input className="input" type="number" step="any" placeholder="0.00" value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} />
                </div>
              </div>
              <div className="flex-row gap-8">
                <button className="btn btn-primary" type="submit">Add</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* Holdings List */}
      {portfolio.length === 0 ? (
        <div className="empty-state">
          <Briefcase size={48} />
          <p>No holdings yet. Add your first stock above.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {portfolio.map((h, i) => (
            <Motion.div key={h.id} className="holding-row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="name">{h.name}</div>
              <div className="sym"><span className="tag tag-gold">{h.symbol}</span></div>
              <div className="qty">Qty: {h.quantity}</div>
              <div className="val">₹{((Number(h.quantity) || 0) * (Number(h.buy_price) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <div className="del">
                <button className="btn btn-danger btn-sm" onClick={() => handleRemove(h.id)}>
                  <X size={14} />
                </button>
              </div>
            </Motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
