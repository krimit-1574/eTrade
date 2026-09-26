const API = typeof window !== 'undefined' && window.location?.origin ? '' : 'http://localhost:8000';

function formatError(detail) {
  if (!detail) return 'Request failed';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join('; ');
  }
  return String(detail);
}

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(formatError(err.detail));
  }
  return res.json();
}

export const api = {
  // Auth
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (username, password, email, dob) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password, email, dob }) }),
  guestLogin: () =>
    request('/api/auth/guest', { method: 'POST' }),

  // Settings
  getSettings: (userId) => request(`/api/settings/${userId}`),
  updateSettings: (userId, avKey, geminiKey) =>
    request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, av_key: avKey, gemini_key: geminiKey }),
    }),

  // Portfolio
  getPortfolio: (userId) => request(`/api/portfolio/${userId}`),
  addPortfolio: (userId, name, symbol, quantity, buyPrice) =>
    request('/api/portfolio', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, name, symbol, quantity, buy_price: buyPrice }),
    }),
  removePortfolio: (pid, userId) =>
    request(`/api/portfolio/${pid}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  // Watchlist
  getWatchlist: (userId) => request(`/api/watchlist/${userId}`),
  addWatchlist: (userId, name, symbol, alertPrice, alertDir) =>
    request('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, name, symbol, alert_price: alertPrice, alert_dir: alertDir }),
    }),
  removeWatchlist: (wid, userId) =>
    request(`/api/watchlist/${wid}?user_id=${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  checkWatchlist: (userId, symbol) => request(`/api/watchlist/check/${userId}/${encodeURIComponent(symbol)}`),
  toggleWatchlist: (userId, symbol, name) =>
    request('/api/watchlist/toggle', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, symbol, name }),
    }),

  // Trading (Paper / Virtual Trading Engine)
  getTradingSummary: (userId) => request(`/api/trading/summary/${userId}`),
  executeOrder: (userId, symbol, name, orderType, quantity, price) =>
    request('/api/trading/order', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, symbol, name, order_type: orderType, quantity: parseFloat(quantity), price: parseFloat(price) }),
    }),

  // Market Data
  getPrice: (symbol, avKey = '') =>
    request(`/api/price/${encodeURIComponent(symbol)}?av_key=${encodeURIComponent(avKey)}`),
  getHistory: (symbol, period = '1y', interval = '') =>
    request(`/api/history/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}${interval ? `&interval=${encodeURIComponent(interval)}` : ''}`),
  searchSymbols: (query) => request(`/api/search?q=${encodeURIComponent(query)}`),

  // AI
  analyze: (userId, query) =>
    request('/api/analyze', { method: 'POST', body: JSON.stringify({ user_id: userId, query }) }),
  compare: (userId, stock1, stock2) =>
    request('/api/compare', { method: 'POST', body: JSON.stringify({ user_id: userId, stock1, stock2 }) }),

  // AI Stock Screener
  getRecommendations: (userId) =>
    request(`/api/screener/recommendations?user_id=${encodeURIComponent(userId || 0)}`),
  refreshRecommendations: (userId) =>
    request(`/api/screener/refresh?user_id=${encodeURIComponent(userId || 0)}`, { method: 'POST' }),

  // AI Intraday Sessions
  saveAISession: (payload) =>
    request('/api/ai-intraday/sessions', { method: 'POST', body: JSON.stringify(payload) }),
  getAISessions: (userId, symbol) => {
    const params = new URLSearchParams();
    if (userId) params.append('user_id', userId);
    if (symbol) params.append('symbol', symbol);
    return request(`/api/ai-intraday/sessions?${params.toString()}`);
  },
  getAISession: (sessionId) =>
    request(`/api/ai-intraday/sessions/${encodeURIComponent(sessionId)}`),

  // PDF (returns blob)
  exportPdf: async (data) => {
    const res = await fetch(`${API}/api/export-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'PDF export failed' }));
      throw new Error(formatError(err.detail));
    }
    return res.blob();
  },
};
