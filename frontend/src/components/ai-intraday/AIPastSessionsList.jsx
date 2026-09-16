import React, { useState, useEffect, useCallback } from 'react';
import {
  History, TrendingUp, TrendingDown, Clock, BarChart2,
  ChevronRight, RefreshCw, Inbox
} from 'lucide-react';
import { SessionJournalService } from '../../services/TechnicalAnalysis/SessionJournalService';

export default function AIPastSessionsList({ userId, onSelectSession }) {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await SessionJournalService.getSessions(userId);
      setSessions(result || []);
    } catch (err) {
      console.warn('AIPastSessionsList: Failed to load sessions', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  if (isLoading) {
    return (
      <div className="card" style={{ padding: '24px', marginTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)' }}>
          <RefreshCw size={16} className="spin-anim" />
          <span style={{ fontSize: '0.82rem' }}>Loading past AI sessions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '20px 24px', marginTop: '20px' }}>
      {/* Section Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <History size={18} color="var(--neon-gold, #F59E0B)" />
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800' }}>
            Past AI Sessions
          </h3>
          {sessions.length > 0 && (
            <span style={{
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-muted)',
            }}>
              {sessions.length}
            </span>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={loadSessions}
          style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Empty State */}
      {sessions.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '30px 0',
          color: 'var(--text-muted)',
        }}>
          <Inbox size={32} style={{ marginBottom: '8px', opacity: 0.3 }} />
          <div style={{ fontSize: '0.82rem', fontWeight: '600' }}>No past sessions recorded yet.</div>
          <div style={{ fontSize: '0.72rem', marginTop: '4px' }}>Start an AI intraday session to build your trade journal.</div>
        </div>
      )}

      {/* Sessions List */}
      {sessions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sessions.map((session) => {
            const pnl = parseFloat(session.realized_pnl || 0);
            const isPositive = pnl >= 0;
            const analytics = session.analytics || {};
            const startDate = session.start_time ? new Date(session.start_time) : null;
            const endDate = session.end_time ? new Date(session.end_time) : null;

            let durationStr = '—';
            if (startDate && endDate) {
              const diffMs = endDate - startDate;
              const mins = Math.floor(diffMs / 60000);
              if (mins >= 60) {
                durationStr = `${Math.floor(mins / 60)}h ${mins % 60}m`;
              } else {
                durationStr = `${mins}m`;
              }
            }

            return (
              <div
                key={session.id}
                onClick={() => onSelectSession && onSelectSession(session)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 100px 80px 40px',
                  alignItems: 'center',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  gap: '12px',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                }}
              >
                {/* Symbol & Date */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: '800', fontSize: '0.88rem' }}>
                      {session.symbol}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: session.status === 'COMPLETED' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                      color: session.status === 'COMPLETED' ? '#10B981' : '#F59E0B',
                      fontWeight: '700',
                    }}>
                      {session.status || 'COMPLETED'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={10} />
                    {startDate ? startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    {' · '}
                    {durationStr}
                  </div>
                </div>

                {/* Trades */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '700' }}>
                    {session.trade_count || 0}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>trades</div>
                </div>

                {/* Win Rate */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#818CF8' }}>
                    {analytics.winRate !== undefined ? `${analytics.winRate}%` : '—'}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>win rate</div>
                </div>

                {/* P&L */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: '0.88rem',
                    fontWeight: '800',
                    color: isPositive ? '#10B981' : '#EF4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                  }}>
                    {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {isPositive ? '+' : ''}₹{pnl.toFixed(0)}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {analytics.netPnLPct !== undefined ? `${analytics.netPnLPct >= 0 ? '+' : ''}${analytics.netPnLPct}%` : ''}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  <ChevronRight size={16} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
