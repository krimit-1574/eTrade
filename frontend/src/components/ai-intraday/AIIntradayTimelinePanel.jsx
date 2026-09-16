import React, { useState } from 'react';
import { History, CheckCircle2, Clock, Terminal, Shield } from 'lucide-react';

export default function AIIntradayTimelinePanel({ symbol, sessionTime, events = [] }) {
  
  // Sort events so newest is on top (descending id/time)
  const sortedEvents = [...events].sort((a, b) => b.id - a.id);

  return (
    <div className="card intraday-panel" style={{ padding: '20px' }}>
      <div className="flex-between mb-16" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(0, 240, 255, 0.1)',
              color: 'var(--neon-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <History size={16} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: '800', margin: 0 }}>Trade Timeline</h3>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Session events & decision audit trail</span>
          </div>
        </div>

        <span
          style={{
            fontSize: '0.68rem',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Clock size={11} /> Live Stream
        </span>
      </div>

      {/* Timeline Event List */}
      <div className="timeline-stream" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
        {sortedEvents.map((evt, idx) => (
          <div key={evt.id} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
            {/* Timeline Line */}
            {idx !== sortedEvents.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '20px',
                  bottom: '-14px',
                  width: '2px',
                  background: 'rgba(255, 255, 255, 0.08)',
                }}
              />
            )}

            {/* Dot Icon */}
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: evt.type === 'active' ? 'var(--neon-cyan-bg)' : (evt.type === 'success' ? 'rgba(0, 255, 128, 0.1)' : 'rgba(255, 255, 255, 0.05)'),
                color: evt.type === 'active' ? 'var(--neon-cyan)' : (evt.type === 'success' ? 'var(--green)' : 'var(--text-muted)'),
                border: evt.type === 'active' ? '1px solid var(--neon-cyan-glow)' : '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                zIndex: 1,
              }}
            >
              <CheckCircle2 size={13} />
            </div>

            {/* Content */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                  {evt.title}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {evt.time}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {evt.detail}
              </p>
            </div>
          </div>
        ))}
        {sortedEvents.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            No events recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}
