const API = typeof window !== 'undefined' && window.location?.origin ? '' : 'http://localhost:8000';
const TOKEN_STORAGE_KEY = 'eTA_auth_token';

function readStoredToken() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) || '' : '';
  } catch {
    return '';
  }
}

let authToken = readStoredToken();

function setAuthToken(token) {
  authToken = typeof token === 'string' ? token : '';
  try {
    if (typeof localStorage !== 'undefined') {
      if (authToken) localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
      else localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // In-memory auth still works when browser storage is unavailable.
  }
}

function clearAuthToken() {
  setAuthToken('');
}

function formatError(detail) {
  if (!detail) return 'Request failed';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join('; ');
  }
  return String(detail);
}

function notifyUnauthorized() {
  clearAuthToken();
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('eta:unauthorized'));
  }
}

async function request(url, options = {}) {
  const { auth = true, headers: optionHeaders = {}, ...fetchOptions } = options;
  const headers = { 'Content-Type': 'application/json', ...optionHeaders };
  const sentBearerToken = auth && Boolean(authToken);
  if (sentBearerToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API}${url}`, { ...fetchOptions, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    // A 401 only invalidates a browser session when a bearer token was
    // actually sent. Guest requests have no token and must not be logged out
    // merely because they touched an authenticated-only feature.
    if (sentBearerToken && res.status === 401) notifyUnauthorized();
    const error = new Error(formatError(err.detail));
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}

async function requestBlob(url, options = {}) {
  const { headers: optionHeaders = {}, ...fetchOptions } = options;
  const headers = { ...optionHeaders };
  const sentBearerToken = Boolean(authToken);
  if (sentBearerToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${API}${url}`, { ...fetchOptions, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    if (sentBearerToken && res.status === 401) notifyUnauthorized();
    const error = new Error(formatError(err.detail));
    error.status = res.status;
    throw error;
  }
  return res.blob();
}

export const api = {
  setAuthToken,
  clearAuthToken,

  // Auth
  login: (username, password) =>
    request('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password }),
    }),
  register: (username, password, email, dob) =>
    request('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ username, password, email, dob }),
    }),
  guestLogin: () => {
    clearAuthToken();
    return request('/api/auth/guest', { method: 'POST', auth: false });
  },
  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  // Settings. User IDs remain accepted by these wrappers for call-site
  // compatibility, but identity is derived only from the bearer token.
  getSettings: (_userId) => request('/api/settings'),
  updateSettings: (_userId, avKey, geminiKey, options = {}) =>
    request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({
        av_key: avKey || null,
        gemini_key: geminiKey || null,
        clear_av_key: Boolean(options.clearAvKey),
        clear_gemini_key: Boolean(options.clearGeminiKey),
      }),
    }),

  // Portfolio
  getPortfolio: (_userId) => request('/api/portfolio'),
  addPortfolio: (_userId, name, symbol, quantity, buyPrice) =>
    request('/api/portfolio', {
      method: 'POST',
      body: JSON.stringify({ name, symbol, quantity, buy_price: buyPrice }),
    }),
  removePortfolio: (pid, _userId) => request(`/api/portfolio/${pid}`, { method: 'DELETE' }),

  // Watchlist
  getWatchlist: (_userId) => request('/api/watchlist'),
  addWatchlist: (_userId, name, symbol, alertPrice, alertDir) =>
    request('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ name, symbol, alert_price: alertPrice, alert_dir: alertDir }),
    }),
  removeWatchlist: (wid, _userId) => request(`/api/watchlist/${wid}`, { method: 'DELETE' }),
  checkWatchlist: (_userId, symbol) =>
    request(`/api/watchlist/check/${encodeURIComponent(symbol)}`),
  toggleWatchlist: (_userId, symbol, name) =>
    request('/api/watchlist/toggle', {
      method: 'POST',
      body: JSON.stringify({ symbol, name }),
    }),

  // Trading (paper / virtual trading engine)
  getTradingSummary: (_userId) => request('/api/trading/summary'),
  executeOrder: (_userId, symbol, name, orderType, quantity, price) =>
    request('/api/trading/order', {
      method: 'POST',
      body: JSON.stringify({
        symbol,
        name,
        order_type: orderType,
        quantity: Number(quantity),
        price: Number(price),
      }),
    }),

  // Market data
  getPrice: (symbol) => request(`/api/price/${encodeURIComponent(symbol)}`),
  getHistory: (symbol, period = '1y', interval = '') =>
    request(`/api/history/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}${interval ? `&interval=${encodeURIComponent(interval)}` : ''}`),
  searchSymbols: (query) => request(`/api/search?q=${encodeURIComponent(query)}`),

  // AI
  analyze: (_userId, query) =>
    request('/api/analyze', { method: 'POST', body: JSON.stringify({ query }) }),
  compare: (_userId, stock1, stock2) =>
    request('/api/compare', { method: 'POST', body: JSON.stringify({ stock1, stock2 }) }),

  // AI stock screener
  getRecommendations: (_userId) => request('/api/screener/recommendations'),
  refreshRecommendations: (_userId) =>
    request('/api/screener/refresh', { method: 'POST' }),
  getIntradayScan: () => request('/api/screener/intraday'),
  refreshIntradayScan: () => request('/api/screener/intraday/refresh', { method: 'POST' }),

  // AI intraday sessions. Ownership fields from UI state are deliberately
  // removed; the backend binds every journal to the authenticated account.
  saveAISession: (payload) => {
    const { user_id: _snakeUser, userId: _camelUser, user: _user, ...session } = payload;
    return request('/api/ai-intraday/sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    });
  },
  getAISessions: (_userId, symbol) => {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    const query = params.toString();
    return request(`/api/ai-intraday/sessions${query ? `?${query}` : ''}`);
  },
  getAISession: (sessionId, _userId) =>
    request(`/api/ai-intraday/sessions/${encodeURIComponent(sessionId)}`),

  exportPdf: (data) =>
    requestBlob('/api/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
