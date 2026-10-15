import { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { api } from '../api';

export default function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState('login');
  
  // Login fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const calculateAge = (dobString) => {
    if (!dobString) return 0;
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (tab === 'login') {
      if (!loginIdentifier || !loginPassword) {
        setError('Please fill in all fields.');
        return;
      }
    } else {
      if (!firstName || !lastName || !email || !password || !confirmPassword || !dob) {
        setError('Please fill in all fields.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      const age = calculateAge(dob);
      if (age < 18) {
        setError('You must be at least 18 years old to create an account.');
        return;
      }
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        const res = await api.login(loginIdentifier, loginPassword);
        onLogin(res);
      } else {
        const usernameToSend = `${firstName} ${lastName}`;
        const res = await api.register(usernameToSend, password, email, dob);
        onLogin(res);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    try {
      const res = await api.guestLogin();
      onLogin(res);
    } catch {
      setError('Failed to start guest session.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <AnimatePresence mode="wait">
        <Motion.div
          key={tab}
          className="auth-card"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <div className="auth-brand">
            <div className="auth-brand-icon">◆</div>
            <h1>eTA</h1>
            <p>eTrade Analysis Terminal</p>
          </div>

          <div className="auth-tabs">
            <button
              className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setError(''); }}
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setError(''); }}
            >
              Create Account
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            {tab === 'login' ? (
              <>
                <div>
                  <label className="input-label">Email or Username</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. user@example.com"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                  />
                </div>
                <div>
                  <label className="input-label">Password</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="input-label">First Name</label>
                    <input
                      className="input"
                      type="text"
                      placeholder="First Name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="input-label">Last Name</label>
                    <input
                      className="input"
                      type="text"
                      placeholder="Last Name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="input-label">Email Address</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="input-label">Date of Birth</label>
                  <input
                    className="input"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="input-label">Password</label>
                    <input
                      className="input"
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="input-label">Confirm Password</label>
                    <input
                      className="input"
                      type="password"
                      placeholder="Confirm"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="auth-actions" style={{ marginTop: '8px' }}>
              <button 
                className="btn btn-primary btn-full" 
                type="submit" 
                disabled={loading}
              >
                {loading ? '...' : tab === 'login' ? 'Sign In →' : 'Create Account →'}
              </button>
            </div>
            
            {tab === 'login' && (
              <button
                type="button"
                className="btn btn-ghost btn-full"
                onClick={handleGuest}
                disabled={loading}
              >
                Continue as Guest
              </button>
            )}
          </form>
        </Motion.div>
      </AnimatePresence>
    </div>
  );
}
