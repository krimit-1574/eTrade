import { useState, useEffect } from 'react';
import { motion as Motion } from 'framer-motion';
import { Save, LogOut, Key } from 'lucide-react';
import { api } from '../api';

export default function SettingsPage({ user, onLogout }) {
  const [avKey, setAvKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [keyStatus, setKeyStatus] = useState({ av: '', gemini: '' });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user.user_id === 'guest') return;
    api.getSettings(user.user_id).then((s) => {
      setKeyStatus({
        av: s.has_av_key ? s.av_key_hint || 'saved' : '',
        gemini: s.has_gemini_key ? s.gemini_key_hint || 'saved' : '',
      });
    }).catch(() => {});
  }, [user.user_id]);

  const handleSave = async () => {
    if (user.user_id === 'guest') {
      return;
    }
    setLoading(true);
    setSaved(false);
    try {
      await api.updateSettings(user.user_id, avKey, geminiKey);
      setKeyStatus((current) => ({
        av: avKey ? `...${avKey.slice(-4)}` : current.av,
        gemini: geminiKey ? `...${geminiKey.slice(-4)}` : current.gemini,
      }));
      setAvKey('');
      setGeminiKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Set<span className="gold-text">tings</span></h1>
        <p>Configure your API keys and preferences.</p>
      </div>

      <Motion.div className="card mb-24" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <Key size={18} style={{ color: 'var(--gold)' }} /> API Keys
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label className="input-label">Alpha Vantage API Key</label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Used for real-time stock prices. Get a free key at alphavantage.co
            </p>
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder={keyStatus.av ? `Saved (${keyStatus.av}); enter a new key to replace` : 'Enter your Alpha Vantage API key...'}
              value={avKey}
              onChange={(e) => setAvKey(e.target.value)}
              id="settings-av-key"
            />
          </div>
          <div>
            <label className="input-label">Gemini API Key</label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Required for AI-powered stock analysis. Get a free key at aistudio.google.com
            </p>
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder={keyStatus.gemini ? `Saved (${keyStatus.gemini}); enter a new key to replace` : 'Enter your Gemini API key...'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              id="settings-gemini-key"
            />
          </div>
        </div>

        <div style={{ marginTop: '24px' }}>
          {user.user_id === 'guest' ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Sign in with an account to save API keys and use AI-backed features.
            </p>
          ) : (
            <button className="btn btn-primary" onClick={handleSave} disabled={loading} id="settings-save-btn">
              <Save size={16} /> {loading ? 'Saving...' : 'Save Settings'}
            </button>
          )}
        </div>

        {saved && <div className="success-banner mt-16">Settings saved successfully!</div>}
      </Motion.div>

      <div className="card" style={{ borderColor: 'rgba(248,113,113,0.2)' }}>
        <h4 style={{ marginBottom: '12px' }}>Account</h4>
        <p style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
          Signed in as <strong style={{ color: 'var(--text-primary)' }}>{user.username}</strong>
        </p>
        <button className="btn btn-danger" onClick={onLogout} id="settings-logout-btn">
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
}
