import { useState, useEffect, useCallback } from 'react';
import './index.css';
import AuthScreen from './pages/AuthScreen.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { api } from './api.js';
import { AISessionManager } from './services/TechnicalAnalysis/AISessionManager.js';
import { PaperTradingAccount } from './services/TechnicalAnalysis/PaperTradingAccount.js';
import { RiskEngine } from './services/TechnicalAnalysis/RiskEngine.js';

function loadSavedUser() {
  try {
    const savedUser = localStorage.getItem('eTA_user');
    return savedUser ? JSON.parse(savedUser) : null;
  } catch {
    localStorage.removeItem('eTA_user');
    return null;
  }
}

function App() {
  const [user, setUser] = useState(loadSavedUser);

  const clearLocalSession = useCallback(() => {
    api.clearAuthToken();
    setUser(null);
    localStorage.removeItem('eTA_user');
  }, []);

  useEffect(() => {
    const handleUnauthorized = async () => {
      try {
        await AISessionManager.shutdown();
      } finally {
        clearLocalSession();
      }
    };
    window.addEventListener('eta:unauthorized', handleUnauthorized);

    return () => window.removeEventListener('eta:unauthorized', handleUnauthorized);
  }, [clearLocalSession]);

  useEffect(() => {
    if (!user) return;
    AISessionManager.initialize(
      PaperTradingAccount.load(),
      RiskEngine.loadSettings(),
      user.user_id,
    );
    if (user.user_id !== 'guest') {
      api.me().catch(() => {
        // The request helper emits eta:unauthorized and clears stale auth.
      });
    }
  }, [user]);

  const handleLogin = (userData) => {
    const { access_token: accessToken, token_type: _tokenType, ...profile } = userData;
    if (accessToken) api.setAuthToken(accessToken);
    else api.clearAuthToken();
    setUser(profile);
    localStorage.setItem('eTA_user', JSON.stringify(profile));
  };

  const handleLogout = async () => {
    try {
      // Persist/liquidate active AI sessions while the bearer token is valid,
      // then revoke it server-side before clearing browser identity.
      await AISessionManager.shutdown();
      if (user?.user_id !== 'guest') await api.logout();
    } catch (error) {
      console.warn('Logout cleanup did not fully complete', error);
    } finally {
      clearLocalSession();
    }
  };

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

export default App;
