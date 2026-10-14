import { ArrowLeft, TrendingUp, TrendingDown, Eye, Search, Sparkles } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { api } from '../api';
import StockRecommendations from '../components/StockRecommendations';

const SEEDS = {
  'us-stocks': [
    { sym: 'AAPL', name: 'Apple Inc.', price: 175.24, change: 1.25, pct: 0.72 },
    { sym: 'MSFT', name: 'Microsoft Corp.', price: 405.10, change: 2.10, pct: 0.52 },
    { sym: 'TSLA', name: 'Tesla Inc.', price: 185.90, change: -3.40, pct: -1.79 },
    { sym: 'AMZN', name: 'Amazon.com Inc.', price: 180.50, change: 0.80, pct: 0.44 },
    { sym: 'NVDA', name: 'NVIDIA Corp.', price: 890.20, change: -12.30, pct: -1.36 },
    { sym: 'GOOGL', name: 'Alphabet Inc.', price: 145.20, change: 1.10, pct: 0.76 },
    { sym: 'META', name: 'Meta Platforms', price: 485.10, change: 4.50, pct: 0.93 },
    { sym: 'BRK.B', name: 'Berkshire Hathaway', price: 408.20, change: -1.20, pct: -0.29 },
  ],
  'us-etfs': [
    { sym: 'SPY', name: 'SPDR S&P 500 ETF', price: 512.45, change: 2.10, pct: 0.41 },
    { sym: 'QQQ', name: 'Invesco QQQ Trust', price: 440.10, change: 3.50, pct: 0.80 },
    { sym: 'VTI', name: 'Vanguard Total Stock', price: 256.80, change: 1.20, pct: 0.47 },
    { sym: 'VOO', name: 'Vanguard S&P 500', price: 470.20, change: 2.05, pct: 0.43 },
    { sym: 'ARKK', name: 'ARK Innovation ETF', price: 48.50, change: -0.40, pct: -0.81 },
  ],
  'crypto-all': [
    { sym: 'BTC', name: 'Bitcoin', price: 68450.00, change: 1250.00, pct: 1.86 },
    { sym: 'ETH', name: 'Ethereum', price: 3450.20, change: 45.60, pct: 1.34 },
    { sym: 'SOL', name: 'Solana', price: 165.80, change: -2.30, pct: -1.37 },
    { sym: 'BNB', name: 'Binance Coin', price: 580.40, change: 12.10, pct: 2.12 },
    { sym: 'XRP', name: 'Ripple', price: 0.62, change: -0.01, pct: -1.50 },
    { sym: 'ADA', name: 'Cardano', price: 0.58, change: 0.02, pct: 3.57 },
    { sym: 'DOGE', name: 'Dogecoin', price: 0.15, change: -0.01, pct: -6.25 },
  ],
  'india-stocks': [
    { sym: 'RELIANCE.NS', name: 'Reliance Industries', price: 2950.45, change: 25.10, pct: 0.86 },
    { sym: 'TCS.NS', name: 'Tata Consultancy Services', price: 4120.30, change: -15.40, pct: -0.37 },
    { sym: 'HDFCBANK.NS', name: 'HDFC Bank Ltd.', price: 1450.60, change: 12.30, pct: 0.85 },
    { sym: 'INFY.NS', name: 'Infosys Ltd.', price: 1630.20, change: 8.50, pct: 0.52 },
    { sym: 'ICICIBANK.NS', name: 'ICICI Bank Ltd.', price: 1120.50, change: 14.20, pct: 1.28 },
    { sym: 'ITC.NS', name: 'ITC Limited', price: 415.80, change: 2.10, pct: 0.51 },
    { sym: 'SBIN.NS', name: 'State Bank of India', price: 780.20, change: -4.50, pct: -0.57 },
    { sym: 'BHARTIARTL.NS', name: 'Bharti Airtel Ltd.', price: 1220.40, change: 15.20, pct: 1.25 },
    { sym: 'LT.NS', name: 'Larsen & Toubro Ltd.', price: 3620.00, change: 42.10, pct: 1.18 },
    { sym: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank', price: 1780.40, change: 8.90, pct: 0.50 },
    { sym: 'TATAMOTORS.NS', name: 'Tata Motors Ltd.', price: 985.60, change: 18.40, pct: 1.90 },
    { sym: 'MARUTI.NS', name: 'Maruti Suzuki India', price: 12450.00, change: -110.00, pct: -0.87 },
    { sym: 'SUNPHARMA.NS', name: 'Sun Pharma Ltd.', price: 1540.20, change: 11.50, pct: 0.75 },
    { sym: 'AXISBANK.NS', name: 'Axis Bank Ltd.', price: 1180.30, change: 9.10, pct: 0.78 },
    { sym: 'TITAN.NS', name: 'Titan Company Ltd.', price: 3420.00, change: 22.40, pct: 0.66 },
    { sym: 'ASIANPAINT.NS', name: 'Asian Paints Ltd.', price: 2890.00, change: -12.30, pct: -0.42 },
    { sym: 'BAJFINANCE.NS', name: 'Bajaj Finance Ltd.', price: 6950.00, change: 65.00, pct: 0.94 },
    { sym: 'ULTRACEMCO.NS', name: 'UltraTech Cement', price: 9980.00, change: 80.00, pct: 0.81 },
    { sym: 'NTPC.NS', name: 'NTPC Limited', price: 365.40, change: 4.20, pct: 1.16 },
    { sym: 'POWERGRID.NS', name: 'Power Grid Corp', price: 310.20, change: 2.80, pct: 0.91 },
    { sym: 'ZOMATO.NS', name: 'Zomato Ltd.', price: 220.50, change: 6.80, pct: 3.18 },
    { sym: 'SUZLON.NS', name: 'Suzlon Energy Ltd.', price: 68.40, change: 2.10, pct: 3.17 },
    { sym: 'JIOFIN.NS', name: 'Jio Financial Services', price: 348.90, change: 5.40, pct: 1.57 },
    { sym: 'TATAPOWER.NS', name: 'Tata Power Ltd.', price: 435.60, change: 8.20, pct: 1.92 },
    { sym: 'ADANIENT.NS', name: 'Adani Enterprises', price: 3150.00, change: 35.00, pct: 1.12 },
    { sym: 'COALINDIA.NS', name: 'Coal India Ltd.', price: 495.20, change: 6.10, pct: 1.25 }
  ],
  'india-etfs': [
    { sym: 'NIFTYBEES.NS', name: 'Nippon India Nifty 50 ETF', price: 255.40, change: 1.20, pct: 0.47 },
    { sym: 'BANKBEES.NS', name: 'Nippon India Bank ETF', price: 480.10, change: -2.50, pct: -0.52 },
    { sym: 'ITBEES.NS', name: 'Nippon India IT ETF', price: 38.50, change: 0.40, pct: 1.05 },
    { sym: 'GOLDBEES.NS', name: 'Nippon India Gold ETF', price: 58.20, change: 0.15, pct: 0.25 },
    { sym: 'LIQUIDBEES.NS', name: 'Nippon India Liquid ETF', price: 1000.00, change: 0.00, pct: 0.00 },
  ]
};

export default function MarketListPage({ user, marketType, assetType, onBack, onAnalyze, onTrade }) {
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [liveData, setLiveData] = useState({});

  const key = `${marketType}-${assetType}`;
  const baseAssets = SEEDS[key] || SEEDS['india-stocks'];

  const getDirectSymbol = (value) => {
    const normalized = value.trim().toUpperCase();
    if (marketType === 'india' && normalized && !normalized.includes('.')) {
      return `${normalized}.NS`;
    }
    return normalized;
  };

  // Handle live search when query is typed
  useEffect(() => {
    if (!search.trim()) return undefined;

    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const queryToSearch = marketType === 'india' && !search.includes('.') 
          ? `${search}` 
          : search;
        
        const res = await api.searchSymbols(queryToSearch);
        let items = res.results || [];

        // If marketType is india, prioritize .NS and .BO stocks or format them
        if (marketType === 'india') {
          items = items.map(item => {
            if (!item.symbol.includes('.')) {
              return { ...item, symbol: `${item.symbol}.NS` };
            }
            return item;
          });
        }

        if (!cancelled) setSearchResults(items);
      } catch (err) {
        console.error("Search failed:", err);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, marketType]);

  // Determine displayed assets (search results or filtered seeds)
  const displayedAssets = useMemo(() => {
    if (search.trim().length > 0 && searchResults.length > 0) {
      return searchResults.map(s => ({
        sym: s.symbol,
        name: s.name,
        price: 0,
        change: 0,
        pct: 0
      }));
    }

    return baseAssets.filter(a =>
      a.sym.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, searchResults, baseAssets]);

  // Fetch live prices for top visible items
  useEffect(() => {
    const top = displayedAssets.slice(0, 15);
    let cancelled = false;

    Promise.all(top.map(async (asset) => {
      try {
        const data = await api.getPrice(asset.sym);
        const price = Number(data?.price);
        if (!Number.isFinite(price) || price <= 0) return null;
        const change = Number(data?.change);
        const pct = Number(data?.pct);
        return [asset.sym, {
          price,
          change: Number.isFinite(change) ? change : 0,
          pct: Number.isFinite(pct) ? pct : 0,
        }];
      } catch {
        return null;
      }
    })).then((entries) => {
      if (cancelled) return;
      const validEntries = entries.filter(Boolean);
      if (validEntries.length > 0) {
        setLiveData((previous) => ({ ...previous, ...Object.fromEntries(validEntries) }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [displayedAssets]);

  let title = '';
  if (marketType === 'us') title = `US & Canada ${assetType === 'etfs' ? 'ETFs' : 'Stocks'}`;
  else if (marketType === 'india') title = `Indian ${assetType === 'etfs' ? 'ETFs' : 'Stocks'}`;
  else if (marketType === 'crypto') title = 'Cryptocurrency Markets';

  return (
    <div className="market-list-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ padding: '8px' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>{title}</h1>
          <p>Search any stock in India or click to analyze with real-time pricing & AI engines.</p>
        </div>
      </div>

      {/* Dynamic Search Bar */}
      <div className="search-bar mb-24" style={{ position: 'relative' }}>
        <input 
          type="text" 
          className="input" 
          placeholder={marketType === 'india' ? "Search ANY stock of India (e.g. Zomato, Suzlon, Tata Motors, Reliance)..." : `Search ${title} by symbol or name...`}
          value={search}
          onChange={(e) => {
            const value = e.target.value;
            setSearch(value);
            if (!value.trim()) {
              setSearchResults([]);
              setSearching(false);
            }
          }}
          style={{ 
            paddingLeft: '40px', 
            background: 'var(--bg-card) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%239CA3AF\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Ccircle cx=\'11\' cy=\'11\' r=\'8\'%3E%3C/circle%3E%3Cline x1=\'21\' y1=\'21\' x2=\'16.65\' y2=\'16.65\'%3E%3C/line%3E%3C/svg%3E") no-repeat 12px center' 
          }}
        />
        {searching && (
          <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--neon-cyan)' }}>
            Searching live market...
          </div>
        )}
      </div>

      {/* Custom Direct Analyze Prompt if user typed custom query */}
      {search.trim().length > 0 && (
        <div className="card card-accent-blue mb-16" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={18} style={{ color: 'var(--neon-cyan)' }} />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Want to analyze <strong>"{search.toUpperCase()}"</strong> directly?
            </span>
          </div>
          <button 
            className="btn btn-primary btn-sm"
            onClick={() => onAnalyze(getDirectSymbol(search))}
          >
            <Eye size={14} /> Analyze "{search.toUpperCase()}" Now
          </button>
        </div>
      )}

      {/* AI Stock Recommendations Bar (only for Indian stocks) */}
      {marketType === 'india' && assetType === 'stocks' && (
        <div className="mb-16">
          <StockRecommendations
            user={user}
            onAnalyze={onAnalyze}
            onTrade={onTrade || ((symbol) => onAnalyze(symbol))}
          />
        </div>
      )}

      {/* Assets Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ maxHeight: 'calc(100vh - 270px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {displayedAssets.map((asset) => {
            const currentData = liveData[asset.sym] || asset;
            const priceVal = typeof currentData.price === 'number' ? currentData.price : parseFloat(currentData.price || 0);
            const changeVal = typeof currentData.change === 'number' ? currentData.change : parseFloat(currentData.change || 0);
            const pctVal = typeof currentData.pct === 'number' ? currentData.pct : parseFloat(currentData.pct || 0);

            const isPositive = changeVal >= 0;
            const isIndian = marketType === 'india' || asset.sym.endsWith('.NS') || asset.sym.endsWith('.BO');
            const currencySymbol = isIndian ? '₹' : '$';

            return (
              <div 
                key={asset.sym} 
                className="holding-row" 
                style={{ borderRadius: '0', borderLeft: 'none', borderRight: 'none', borderTop: 'none', cursor: 'pointer' }}
                onClick={() => onAnalyze(asset.sym)}
              >
                <div style={{ flex: '0 0 140px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {asset.sym}
                </div>
                <div className="name" style={{ color: 'var(--text-secondary)', flex: 1 }}>
                  {asset.name}
                </div>
                <div className="val" style={{ textAlign: 'right', fontWeight: '700', flex: '0 0 110px' }}>
                  {priceVal > 0 ? `${currencySymbol}${priceVal.toFixed(2)}` : 'Live Price...'}
                </div>
                <div 
                  style={{ 
                    flex: '0 0 110px', 
                    textAlign: 'right', 
                    color: isPositive ? 'var(--green)' : 'var(--red)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    fontWeight: '600'
                  }}
                >
                  {isPositive ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                  {isPositive ? '+' : ''}{pctVal.toFixed(2)}%
                </div>
                <button 
                  className="btn btn-primary btn-sm" 
                  style={{ marginLeft: '16px' }}
                  onClick={(e) => { e.stopPropagation(); onAnalyze(asset.sym); }}
                >
                  <Eye size={14} /> Analyze
                </button>
              </div>
            );
          })}
          {displayedAssets.length === 0 && (
            <div className="empty-state" style={{ padding: '32px 16px' }}>
              <p style={{ color: 'var(--text-secondary)' }}>No cached matching assets found for "{search}".</p>
              <button 
                className="btn btn-primary mt-16"
                onClick={() => onAnalyze(getDirectSymbol(search))}
              >
                <Sparkles size={16} /> Run Full AI Analysis on "{search.toUpperCase()}"
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
