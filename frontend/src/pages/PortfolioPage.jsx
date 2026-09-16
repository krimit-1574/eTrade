import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Briefcase } from 'lucide-react';
import { api } from '../api';

export default function PortfolioPage({ user }) {
  const [portfolio, setPortfolio] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', symbol: '', quantity: '', buy_price: '' });
  const [error, setError] = useState('');

  const fetchPortfolio = async () => {
    if (user.user_id === 'guest') return;
    try {
      const res = await api.getPortfolio(user.user_id);
      setPortfolio(res);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchPortfolio(); }, []);

  const total = portfolio.reduce((sum, h) => sum + h.quantity * h.buy_price, 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.symbol || !form.quantity || !form.buy_price) {
      setError('Please fill in all fields.');
      return;
    }
    try {
      await api.addPortfolio(user.user_id, form.name, form.symbol, parseFloat(form.quantity), parseFloat(form.buy_price));
      setForm({ name: '', symbol: '', quantity: '', buy_price: '' });
      setShowForm(false);
      fetchPortfolio();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (pid) => {
    try {
      await api.removePortfolio(pid, user.user_id);
      fetchPortfolio();
    } catch { /* ignore */ }
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
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} id="portfolio-add-btn">
          <Plus size={16} /> Add Holding
        </button>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
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
          </motion.div>
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
            <motion.div key={h.id} className="holding-row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="name">{h.name}</div>
              <div className="sym"><span className="tag tag-gold">{h.symbol}</span></div>
              <div className="qty">Qty: {h.quantity}</div>
              <div className="val">₹{(h.quantity * h.buy_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <div className="del">
                <button className="btn btn-danger btn-sm" onClick={() => handleRemove(h.id)}>
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
