import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DollarSign, TrendingUp, TrendingDown, RefreshCw, ShoppingCart, ArrowUpRight, ArrowDownRight, Activity, Plus, Search, Eye, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../api';

export default function TradingPage({ user, onAnalyze, initialSymbol = '' }) {
  const [summary, setSummary] = useState({ virtual_cash: 1000000.0, portfolio: [], transactions: [] });
  const [livePrices, setLivePrices] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  
  // Order Form State
  const [orderType, setOrderType] = useState('BUY'); // BUY or SELL
  const [symbolInput, setSymbolInput] = useState(initialSymbol || '');
  const [nameInput, setNameInput] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [priceInput, setPriceInput] = useState('');
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [orderSuccess, setOrderSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Search suggestions inside order modal
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const isGuest = user?.user_id === 'guest';

  const fetchSummary = async () => {
    if (!user || user.user_id === 'guest') return;
    try {
      const res = await api.getTradingSummary(user.user_id);
      setSummary(res);
      refreshLivePrices(res.portfolio);
    } catch { /* ignore */ }
  };

  const handleFetchLiveQuote = async (sym) => {
    if (!sym) return;
    setFetchingPrice(true);
    try {
      const data = await api.getPrice(sym);
      if (data && data.price !== 'N/A') {
        setPriceInput(data.price);
        if (data.symbol) setSymbolInput(data.symbol);
      }
    } catch { /* ignore */ }
    finally {
      setFetchingPrice(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [user]);

  // Open modal if initialSymbol provided
  useEffect(() => {
    if (initialSymbol) {
      setSymbolInput(initialSymbol);
      handleFetchLiveQuote(initialSymbol);
      setShowOrderModal(true);
    }
  }, [initialSymbol]);

  // Live Price refresh for active portfolio positions
  const refreshLivePrices = async (portfolioItems = summary.portfolio) => {
    if (!portfolioItems || portfolioItems.length === 0) return;
    setRefreshing(true);
    const updatedPrices = { ...livePrices };

    await Promise.allSettled(
      portfolioItems.map(async (pos) => {
        try {
          const res = await api.getPrice(pos.symbol);
          if (res && res.price !== 'N/A') {
            updatedPrices[pos.symbol] = {
              price: parseFloat(res.price),
              change: parseFloat(res.change || 0),
              pct: parseFloat(res.pct || 0),
            };
          }
        } catch { /* ignore */ }
      })
    );

    setLivePrices(updatedPrices);
    setRefreshing(false);
  };

  // Live search inside order modal
  useEffect(() => {
    if (!symbolInput.trim() || symbolInput.length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.searchSymbols(symbolInput);
        setSearchResults(res.results || []);
        setShowSearchDropdown(true);
      } catch {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [symbolInput]);

  const handleOpenOrder = (sym = '', name = '', type = 'BUY', defaultPrice = '') => {
    setOrderType(type);
    setSymbolInput(sym);
    setNameInput(name || sym);
    setQuantity('10');
    setPriceInput(defaultPrice ? String(defaultPrice) : '');
    setOrderError('');
    setOrderSuccess('');
    setShowOrderModal(true);

    if (sym) {
      handleFetchLiveQuote(sym);
    }
  };

  const handleExecuteOrder = async (e) => {
    e.preventDefault();
    if (isGuest) {
      setOrderError('Please sign in to execute paper trades.');
      return;
    }
    setOrderError('');
    setOrderSuccess('');

    if (!symbolInput || !quantity || !priceInput) {
      setOrderError('Please fill in Stock Symbol, Quantity, and Price.');
      return;
    }

    const qtyNum = parseFloat(quantity);
    const priceNum = parseFloat(priceInput);

    if (isNaN(qtyNum) || qtyNum <= 0) {
      setOrderError('Please enter a valid positive quantity.');
      return;
    }

    if (isNaN(priceNum) || priceNum <= 0) {
      setOrderError('Invalid stock price quote.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.executeOrder(user.user_id, symbolInput.toUpperCase(), nameInput || symbolInput, orderType, qtyNum, priceNum);
      setOrderSuccess(res.message || 'Order executed successfully!');
      setTimeout(() => {
        setShowOrderModal(false);
        fetchSummary();
      }, 1200);
    } catch (err) {
      setOrderError(err.message || 'Failed to execute order');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculation of Portfolio Performance
  const activePortfolio = summary.portfolio || [];
  let totalInvested = 0;
  let totalCurrentValue = 0;

  activePortfolio.forEach((pos) => {
    const live = livePrices[pos.symbol]?.price || pos.buy_price;
    const inv = pos.quantity * pos.buy_price;
    const curVal = pos.quantity * live;
    totalInvested += inv;
    totalCurrentValue += curVal;
  });

  const totalPnL = totalCurrentValue - totalInvested;
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
  const virtualCash = summary.virtual_cash || 1000000.0;
  const netWorth = virtualCash + totalCurrentValue;

  return (
    <div className="trading-page">
      {isGuest && (
        <div className="error-banner mb-24">
          Paper trading requires a signed-in account. Please create an account or sign in to use virtual trading.
        </div>
      )}
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1>Paper <span className="gold-text">Trading Platform</span></h1>
          <p>Real-time simulated trading with virtual cash balance. Zero risk, real stock market experience.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-outline" onClick={() => refreshLivePrices()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh Quotes'}
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenOrder('', '', 'BUY')} disabled={isGuest}>
            <Plus size={16} /> New Trade Order
          </button>
        </div>
      </div>

      {/* Account Overview Cards */}
      <div className="grid-4 mb-24 gap-16">
        {/* Total Net Worth */}
        <div className="card card-accent-gold">
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Net Worth</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--gold)', marginTop: '4px' }}>
            ₹{netWorth.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cash + Live Portfolio Value</span>
        </div>

        {/* Available Virtual Cash */}
        <div className="card card-accent-blue">
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Virtual Cash Balance</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neon-cyan)', marginTop: '4px' }}>
            ₹{virtualCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Available for Buying</span>
        </div>

        {/* Total Invested */}
        <div className="card card-accent-gold">
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invested Capital</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
            ₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{activePortfolio.length} Active Positions</span>
        </div>

        {/* Total Profit / Loss */}
        <div className={`card ${totalPnL >= 0 ? 'card-accent-green' : 'card-accent-red'}`}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Profit / Loss</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: totalPnL >= 0 ? 'var(--green)' : 'var(--red)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {totalPnL >= 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
            {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: totalPnL >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {totalPnL >= 0 ? '+' : ''}{totalPnLPct.toFixed(2)}% Overall Return
          </span>
        </div>
      </div>

      {/* Active Holdings Table */}
      <div className="card mb-24" style={{ padding: '20px' }}>
        <div className="flex-between mb-16">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} style={{ color: 'var(--gold)' }} /> Active Stock Holdings & Live P&L
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Updated live with real-time market data</span>
        </div>

        {activePortfolio.length === 0 ? (
          <div className="empty-state" style={{ padding: '36px 16px' }}>
            <ShoppingCart size={44} style={{ color: 'var(--text-muted)' }} />
            <p style={{ marginTop: '12px', fontSize: '0.95rem' }}>No open stock positions yet.</p>
            <button className="btn btn-primary mt-16" onClick={() => handleOpenOrder('', '', 'BUY')} disabled={isGuest}>
              <Plus size={16} /> Place Your First Trade Order
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 8px' }}>Stock</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Shares</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Avg Buy Price</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Live Price</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Current Value</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Profit / Loss</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activePortfolio.map((pos) => {
                  const live = livePrices[pos.symbol]?.price || pos.buy_price;
                  const invVal = pos.quantity * pos.buy_price;
                  const curVal = pos.quantity * live;
                  const posPnL = curVal - invVal;
                  const posPnLPct = invVal > 0 ? (posPnL / invVal) * 100 : 0;
                  const isProfit = posPnL >= 0;

                  return (
                    <tr key={pos.id} style={{ borderBottom: '1px solid var(--border)', height: '54px' }}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pos.symbol}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pos.name}</div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{pos.quantity}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>₹{pos.buy_price.toFixed(2)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--neon-cyan)' }}>
                        ₹{live.toFixed(2)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                        ₹{curVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: isProfit ? 'var(--green)' : 'var(--red)' }}>
                          {isProfit ? '+' : ''}₹{posPnL.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: isProfit ? 'var(--green)' : 'var(--red)' }}>
                          {isProfit ? '+' : ''}{posPnLPct.toFixed(2)}%
                        </div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button 
                            className="btn btn-sm btn-primary"
                            title="Buy More Shares"
                            onClick={() => handleOpenOrder(pos.symbol, pos.name, 'BUY', live)}
                          >
                            + Buy
                          </button>
                          <button 
                            className="btn btn-sm btn-danger"
                            title="Sell Shares"
                            onClick={() => handleOpenOrder(pos.symbol, pos.name, 'SELL', live)}
                          >
                            - Sell
                          </button>
                          {onAnalyze && (
                            <button 
                              className="btn btn-sm btn-ghost"
                              title="Analyze Stock"
                              onClick={() => onAnalyze(pos.symbol)}
                            >
                              <Eye size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction History Ledger */}
      <div className="card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>📜 Recent Order Execution History</h3>
        {summary.transactions?.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No past order transactions found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 8px' }}>Date & Time</th>
                  <th style={{ padding: '10px 8px' }}>Type</th>
                  <th style={{ padding: '10px 8px' }}>Symbol</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Shares</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Execution Price</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Total Value</th>
                </tr>
              </thead>
              <tbody>
                {summary.transactions?.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--border)', height: '44px' }}>
                    <td style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{tx.timestamp}</td>
                    <td style={{ padding: '8px' }}>
                      <span className={`tag ${tx.order_type === 'BUY' ? 'tag-green' : 'tag-red'}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                        {tx.order_type}
                      </span>
                    </td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{tx.symbol}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{tx.quantity}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>₹{tx.price.toFixed(2)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                      ₹{tx.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Execution Modal */}
      <AnimatePresence>
        {showOrderModal && (
          <div className="spinner-overlay" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 100 }}>
            <motion.div 
              className="card" 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              style={{ width: '90%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="flex-between mb-16">
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Execute Virtual Trade</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowOrderModal(false)}>✕</button>
              </div>

              {/* Order Type Selector */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                <button 
                  className={`btn ${orderType === 'BUY' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ background: orderType === 'BUY' ? 'var(--green)' : 'transparent', color: '#FFF' }}
                  onClick={() => setOrderType('BUY')}
                >
                  <ArrowUpRight size={16} /> BUY ORDER
                </button>
                <button 
                  className={`btn ${orderType === 'SELL' ? 'btn-danger' : 'btn-ghost'}`}
                  style={{ background: orderType === 'SELL' ? 'var(--red)' : 'transparent', color: '#FFF' }}
                  onClick={() => setOrderType('SELL')}
                >
                  <ArrowDownRight size={16} /> SELL ORDER
                </button>
              </div>

              {orderError && <div className="error-banner mb-16"><AlertCircle size={16} /> {orderError}</div>}
              {orderSuccess && <div className="success-banner mb-16"><CheckCircle size={16} /> {orderSuccess}</div>}

              <form onSubmit={handleExecuteOrder}>
                {/* Symbol Input */}
                <div style={{ marginBottom: '14px', position: 'relative' }}>
                  <label className="input-label">Stock Symbol / Company Name</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      className="input" 
                      placeholder="e.g. RELIANCE.NS, ZOMATO, AAPL..."
                      value={symbolInput}
                      onChange={(e) => {
                        setSymbolInput(e.target.value);
                        setNameInput(e.target.value);
                      }}
                    />
                    <button 
                      type="button" 
                      className="btn btn-outline btn-sm"
                      onClick={() => handleFetchLiveQuote(symbolInput)}
                      disabled={fetchingPrice}
                    >
                      {fetchingPrice ? 'Quote...' : 'Get Price'}
                    </button>
                  </div>

                  {/* Dropdown Suggestions */}
                  {showSearchDropdown && searchResults.length > 0 && (
                    <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, padding: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                      {searchResults.map((s, i) => (
                        <div 
                          key={i}
                          style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}
                          onClick={() => {
                            setSymbolInput(s.symbol);
                            setNameInput(s.name);
                            setShowSearchDropdown(false);
                            handleFetchLiveQuote(s.symbol);
                          }}
                        >
                          <strong>{s.symbol}</strong> - {s.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Price & Quantity Inputs */}
                <div className="grid-2 gap-12 mb-16">
                  <div>
                    <label className="input-label">Shares Quantity</label>
                    <input 
                      className="input" 
                      type="number" 
                      step="any" 
                      min="0.01"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="input-label">Market Price (₹)</label>
                    <input 
                      className="input" 
                      type="number" 
                      step="any" 
                      placeholder="0.00"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                    />
                  </div>
                </div>

                {/* Total Cost & Cash Balance Preview */}
                <div className="card card-accent-gold mb-20" style={{ padding: '12px 16px', background: 'var(--bg-lighter)' }}>
                  <div className="flex-between" style={{ fontSize: '0.85rem' }}>
                    <span>Estimated Order Value:</span>
                    <strong style={{ fontSize: '1rem', color: 'var(--gold)' }}>
                      ₹{((parseFloat(quantity) || 0) * (parseFloat(priceInput) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div className="flex-between mt-4" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>Available Cash:</span>
                    <span>₹{virtualCash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex-row gap-8">
                  <button 
                    type="submit" 
                    className={`btn ${orderType === 'BUY' ? 'btn-primary' : 'btn-danger'}`}
                    style={{ flex: 1, background: orderType === 'BUY' ? 'var(--green)' : 'var(--red)' }}
                    disabled={submitting}
                  >
                    {submitting ? 'Executing...' : `Confirm ${orderType} Order`}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowOrderModal(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
