import { useState, useEffect } from 'react';
import { Home, Search, Briefcase, BarChart3, Eye, Settings, LogOut, TrendingUp, Zap } from 'lucide-react';
import HomePage from './HomePage.jsx';
import MarketListPage from './MarketListPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import AnalysisPage from './AnalysisPage.jsx';
import PortfolioPage from './PortfolioPage.jsx';
import ComparePage from './ComparePage.jsx';
import WatchlistPage from './WatchlistPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import TradingPage from './TradingPage.jsx';
import AIIntradayPage from './AIIntradayPage.jsx';

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'analysis', label: 'Research', icon: Search },
  { id: 'trading', label: 'Paper Trade', icon: TrendingUp },
  { id: 'ai-intraday', label: 'AI Intraday', icon: Zap },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
  { id: 'compare', label: 'Compare', icon: BarChart3 },
  { id: 'watchlist', label: 'Watchlist', icon: Eye },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Dashboard({ user, onLogout }) {
  const [activePage, setActivePage] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || localStorage.getItem('eTA_activePage') || 'home';
  });
  const [analysisQuery, setAnalysisQuery] = useState(() => localStorage.getItem('eTA_analysisQuery') || '');
  const [tradeSymbol, setTradeSymbol] = useState('');

  useEffect(() => {
    localStorage.setItem('eTA_activePage', activePage);
    if (window.location.hash !== `#${activePage}`) {
      window.history.pushState(null, '', `#${activePage}`);
    }
  }, [activePage]);

  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) setActivePage(hash);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    localStorage.setItem('eTA_analysisQuery', analysisQuery);
  }, [analysisQuery]);

  const renderPage = () => {
    if (activePage.startsWith('market-')) {
      const parts = activePage.split('-');
      const marketType = parts[1];
      const assetType = parts[2] || 'all';
      return (
        <MarketListPage 
          user={user} 
          marketType={marketType} 
          assetType={assetType}
          onBack={() => setActivePage('home')} 
          onAnalyze={(symbol) => {
            setAnalysisQuery(symbol);
            setActivePage('analysis');
          }}
          onTrade={(symbol) => {
            setTradeSymbol(symbol);
            setActivePage('trading');
          }}
        />
      );
    }

    if (activePage.startsWith('ai-intraday')) {
      const parts = activePage.split('/');
      const symbol = parts[1] || null;
      return (
        <AIIntradayPage
          user={user}
          activeSymbol={symbol}
          onStartAI={(sym) => setActivePage(`ai-intraday/${sym}`)}
          onBackToDashboard={() => setActivePage('ai-intraday')}
        />
      );
    }

    switch (activePage) {
      case 'home': return <HomePage user={user} onNavigate={setActivePage} />;
      case 'profile': return <ProfilePage user={user} />;
      case 'analysis': return (
        <AnalysisPage
          user={user}
          initialQuery={analysisQuery}
          onTrade={(symbol) => {
            setTradeSymbol(symbol);
            setActivePage('trading');
          }}
        />
      );
      case 'trading': return (
        <TradingPage
          user={user}
          initialSymbol={tradeSymbol}
          onAnalyze={(symbol) => {
            setAnalysisQuery(symbol);
            setActivePage('analysis');
          }}
        />
      );
      case 'portfolio': return <PortfolioPage user={user} />;
      case 'compare': return <ComparePage user={user} />;
      case 'watchlist': return <WatchlistPage user={user} />;
      case 'settings': return <SettingsPage user={user} onLogout={onLogout} />;
      default: return <HomePage user={user} onNavigate={setActivePage} />;
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div 
          className="sidebar-brand" 
          onClick={() => setActivePage('home')} 
          style={{ cursor: 'pointer' }}
          title="Go to Home"
        >
          <div className="sidebar-brand-icon">◆</div>
          <div className="sidebar-brand-text">
            <h3>eTA</h3>
            <span>eTrade Analysis</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activePage === id || (id === 'ai-intraday' && activePage.startsWith('ai-intraday/'));
            return (
              <button
                key={id}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setActivePage(id)}
                id={`nav-${id}`}
              >
                <Icon size={18} />
                {label}
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div 
            className={`nav-item ${activePage === 'profile' ? 'active' : ''}`}
            onClick={() => setActivePage('profile')}
            style={{ 
              padding: '8px 12px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px'
            }}
            title="View Profile"
          >
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--gold), #B8962E)',
              color: 'var(--bg-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: '800', fontSize: '0.9rem', flexShrink: 0,
              boxShadow: 'var(--shadow-sm)'
            }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                Hello {user.username}
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '-2px' }}>View Profile</span>
            </div>
          </div>

          <button className="nav-item" onClick={onLogout} id="nav-logout">
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
