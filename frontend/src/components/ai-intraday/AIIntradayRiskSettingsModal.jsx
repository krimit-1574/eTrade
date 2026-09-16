import React, { useState } from 'react';
import { X, ShieldAlert, RotateCcw, Check, Info } from 'lucide-react';
import { DEFAULT_RISK_SETTINGS } from '../../services/TechnicalAnalysis/RiskEngine';

export default function AIIntradayRiskSettingsModal({ isOpen, onClose, currentSettings, onSave, onReset }) {
  if (!isOpen) return null;

  const [form, setForm] = useState({ ...DEFAULT_RISK_SETTINGS, ...currentSettings });
  const [savedNotice, setSavedNotice] = useState(false);

  const handleChange = (field, value) => {
    setForm(prev => ({
      ...prev,
      [field]: typeof DEFAULT_RISK_SETTINGS[field] === 'number' ? Number(value) : value
    }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    onSave(form);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 600);
  };

  const handleReset = () => {
    const defaults = { ...DEFAULT_RISK_SETTINGS };
    setForm(defaults);
    if (onReset) onReset();
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div 
        className="card" 
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: '#0F172A',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-between mb-20" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldAlert size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }}>Intraday Risk Engine Settings</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Absolute authority rules — The AI cannot bypass these limits
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '6px', borderRadius: '50%' }}
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Disclaimer Notice */}
        <div 
          className="mb-20" 
          style={{
            padding: '10px 14px',
            background: 'rgba(255, 255, 255, 0.03)',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.74rem',
            color: 'var(--text-secondary)'
          }}
        >
          <Info size={16} style={{ color: 'var(--neon-blue)', flexShrink: 0 }} />
          <span>
            These risk parameters define non-negotiable execution boundaries. Sensible defaults are pre-configured, but no parameter configuration guarantees profitability.
          </span>
        </div>

        <form onSubmit={handleSave}>
          <div className="grid-2" style={{ gap: '16px', marginBottom: '20px' }}>
            {/* Section 1: Capital & Sizing Rules */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--neon-blue)', marginBottom: '12px' }}>
                1. Capital & Sizing
              </h4>

              <div className="form-group mb-12">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Paper Capital (₹)
                </label>
                <input 
                  type="number"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.paperCapital}
                  onChange={(e) => handleChange('paperCapital', e.target.value)}
                  min="10000"
                  step="5000"
                />
              </div>

              <div className="form-group mb-12">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Max Risk Per Trade (%)
                </label>
                <input 
                  type="number"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.maxRiskPerTradePct}
                  onChange={(e) => handleChange('maxRiskPerTradePct', e.target.value)}
                  min="0.1"
                  max="5.0"
                  step="0.1"
                />
                <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                  ≈ ₹{Math.round(form.paperCapital * (form.maxRiskPerTradePct / 100)).toLocaleString('en-IN')} nominal risk
                </span>
              </div>

              <div className="form-group mb-12">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Max Capital Allocation Per Trade (%)
                </label>
                <input 
                  type="number"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.maxCapitalPerTradePct}
                  onChange={(e) => handleChange('maxCapitalPerTradePct', e.target.value)}
                  min="5"
                  max="50"
                  step="1"
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Max Daily Loss Limit (₹)
                </label>
                <input 
                  type="number"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.maxDailyLoss}
                  onChange={(e) => handleChange('maxDailyLoss', e.target.value)}
                  min="500"
                  step="250"
                />
              </div>
            </div>

            {/* Section 2: Trade Frequency & Quality */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--neon-blue)', marginBottom: '12px' }}>
                2. Discipline & Quality Gates
              </h4>

              <div className="form-group mb-12">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Min AI Confidence (%)
                </label>
                <input 
                  type="number"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.minAiConfidence}
                  onChange={(e) => handleChange('minAiConfidence', e.target.value)}
                  min="50"
                  max="95"
                  step="1"
                />
              </div>

              <div className="form-group mb-12">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Min Risk / Reward Ratio
                </label>
                <input 
                  type="number"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.minRiskReward}
                  onChange={(e) => handleChange('minRiskReward', e.target.value)}
                  min="1.0"
                  max="4.0"
                  step="0.1"
                />
              </div>

              <div className="form-group mb-12">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Max Trades Per Stock (Daily)
                </label>
                <input 
                  type="number"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.maxTradesPerStock}
                  onChange={(e) => handleChange('maxTradesPerStock', e.target.value)}
                  min="1"
                  max="10"
                  step="1"
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Max Consecutive Losses
                </label>
                <input 
                  type="number"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.maxConsecutiveLosses}
                  onChange={(e) => handleChange('maxConsecutiveLosses', e.target.value)}
                  min="1"
                  max="5"
                  step="1"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Time Windows & Overtrading */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--neon-blue)', marginBottom: '12px' }}>
              3. Session Timing & Cooldown Rules
            </h4>
            <div className="grid-3" style={{ gap: '12px' }}>
              <div className="form-group">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Session Start Time (IST)
                </label>
                <input 
                  type="text"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.tradingStartTime}
                  onChange={(e) => handleChange('tradingStartTime', e.target.value)}
                  placeholder="09:15"
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Intraday Cutoff Time (IST)
                </label>
                <input 
                  type="text"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.intradayCutoffTime}
                  onChange={(e) => handleChange('intradayCutoffTime', e.target.value)}
                  placeholder="15:15"
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Post-Trade Cooldown (Mins)
                </label>
                <input 
                  type="number"
                  className="form-control"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }}
                  value={form.cooldownMinutes}
                  onChange={(e) => handleChange('cooldownMinutes', e.target.value)}
                  min="1"
                  max="30"
                  step="1"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex-between">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleReset}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
            >
              <RotateCcw size={14} />
              <span>Reset Defaults</span>
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{ fontSize: '0.8rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '800' }}
              >
                {savedNotice ? <Check size={14} /> : null}
                <span>{savedNotice ? 'Saved!' : 'Save & Enforce Rules'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
