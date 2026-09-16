import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Eye, Bell, RefreshCw } from 'lucide-react';
import { api } from '../api';

export default function WatchlistPage({ user }) {
  const [watchlist, setWatchlist] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', symbol: '', alert_price: '', alert_dir: 'below' });
  const [error, setError] = useState('');
  const [livePrices, setLivePrices] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const fetchWatchlist = async () => {
    if (user.user_id === 'guest') return;
    try {
      const res = await api.getWatchlist(user.user_id);
      setWatchlist(res);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchWatchlist(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.symbol || !form.alert_price) {
      setError('Please fill in all fields.');
      return;
    }
    try {
      await api.addWatchlist(user.user_id, form.name, form.symbol, parseFloat(form.alert_price), form.alert_dir);
      setForm({ name: '', symbol: '', alert_price: '', alert_dir: 'below' });
      setShowForm(false);
      fetchWatchlist();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (wid) => {
    try {
      await api.removeWatchlist(wid, user.user_id);
      fetchWatchlist();
    } catch { /* ignore */ }
  };

  const refreshPrices = async () => {
    setRefreshing(true);
    const prices = {};
    for (const w of watchlist) {
      try {
        const p = await api.getPrice(w.symbol);
        if (p && p.price !== 'N/A') prices[w.symbol] = p;
      } catch { /* ignore */ }
    }
    setLivePrices(prices);
    setRefreshing(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Watch<span className="gold-text">list</span></h1>
        <p>Set price alerts and monitor your favorite stocks.</p>
      </div>

      <div className="flex-row gap-8 mb-24">
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} id="watchlist-add-btn">
          <Plus size={16} /> Add Alert
        </button>
        <button className="btn btn-outline" onClick={refreshPrices} disabled={refreshing} id="watchlist-refresh-btn">
          <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh Prices'}
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
            <h4 style={{ marginBottom: '16px' }}>Add Price Alert</h4>
            {error && <div className="error-banner">{error}</div>}
            <form onSubmit={handleAdd}>
              <div className="grid-4 mb-16">
                <div>
                  <label className="input-label">Name</label>
                  <input className="input" placeholder="e.g. Infosys" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="input-label">Symbol</label>
                  <input className="input" placeholder="e.g. INFY.NS" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} />
                </div>
                <div>
                  <label className="input-label">Alert Price (₹)</label>
                  <input className="input" type="number" step="any" placeholder="0.00" value={form.alert_price} onChange={(e) => setForm({ ...form, alert_price: e.target.value })} />
                </div>
                <div>
                  <label className="input-label">Direction</label>
                  <select className="select" value={form.alert_dir} onChange={(e) => setForm({ ...form, alert_dir: e.target.value })}>
                    <option value="below">Below (≤)</option>
                    <option value="above">Above (≥)</option>
                  </select>
                </div>
              </div>
              <div className="flex-row gap-8">
                <button className="btn btn-primary" type="submit">Add to Watchlist</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Watchlist */}
      {watchlist.length === 0 ? (
        <div className="empty-state">
          <Eye size={48} />
          <p>No stocks on your watchlist. Add one above.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {watchlist.map((w, i) => {
            const live = livePrices[w.symbol];
            const hit = live && (
              w.alert_dir === 'below' ? parseFloat(live.price) <= w.alert_price : parseFloat(live.price) >= w.alert_price
            );
            return (
              <motion.div
                key={w.id}
                className="holding-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                style={hit ? { borderColor: 'var(--red)', background: 'var(--red-bg)' } : {}}
              >
                <div className="name">{w.name}</div>
                <div className="sym"><span className="tag tag-gold">{w.symbol}</span></div>
                <div className="qty" style={{ fontSize: '0.8rem' }}>
                  Alert: {w.alert_dir === 'below' ? '≤' : '≥'} ₹{w.alert_price}
                </div>
                <div className="val">
                  {live ? (
                    <span style={{ fontWeight: 600 }}>₹{live.price}</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </div>
                {hit && (
                  <span className="tag tag-red" style={{ animation: 'pulse 1s infinite' }}>
                    <Bell size={12} /> ALERT
                  </span>
                )}
                <div className="del">
                  <button className="btn btn-danger btn-sm" onClick={() => handleRemove(w.id)}>
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
