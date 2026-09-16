import React from 'react';
import { 
  Sparkles, Loader2, Play, PauseCircle, Clock, 
  CheckCircle2, ShieldAlert, WifiOff, AlertTriangle, Activity 
} from 'lucide-react';

export const AI_STATES = {
  READY: 'READY',
  ANALYSING: 'ANALYSING',
  WAITING: 'WAITING',
  WAITING_FOR_CONFIRMATION: 'WAITING FOR CONFIRMATION',
  RUNNING: 'RUNNING',
  POSITION_ACTIVE: 'POSITION ACTIVE',
  STOPPED: 'STOPPED',
  RISK_LIMIT_REACHED: 'RISK LIMIT REACHED',
  DATA_DISCONNECTED: 'DATA DISCONNECTED',
  MARKET_CLOSED: 'MARKET CLOSED',
};

export default function AIStatusBadge({ state = AI_STATES.READY, size = 'md', className = '' }) {
  const normalized = (state || '').toUpperCase();

  let config = {
    label: 'READY',
    icon: Sparkles,
    bgClass: 'ai-badge-ready',
    color: 'var(--neon-cyan, #06B6D4)',
  };

  if (normalized.includes('ANALYSING') || normalized.includes('ANALYZING')) {
    config = {
      label: 'ANALYSING',
      icon: Loader2,
      bgClass: 'ai-badge-analysing',
      color: 'var(--neon-purple, #A855F7)',
      spin: true,
    };
  } else if (normalized.includes('CONFIRM') || normalized.includes('CONFIRMING')) {
    config = {
      label: 'WAITING FOR CONFIRMATION',
      icon: Clock,
      bgClass: 'ai-badge-waiting-conf',
      color: '#F59E0B',
      pulse: true,
    };
  } else if (normalized.includes('POSITION ACTIVE') || normalized.includes('POSITION OPEN') || normalized.includes('OPEN')) {
    config = {
      label: 'POSITION ACTIVE',
      icon: Activity,
      bgClass: 'ai-badge-position-active',
      color: 'var(--green, #10B981)',
      pulse: true,
    };
  } else if (normalized.includes('RUNNING')) {
    config = {
      label: 'RUNNING',
      icon: Play,
      bgClass: 'ai-badge-running',
      color: 'var(--green, #10B981)',
      pulse: true,
    };
  } else if (normalized.includes('DISCONNECT') || normalized.includes('STALE')) {
    config = {
      label: 'DATA DISCONNECTED',
      icon: WifiOff,
      bgClass: 'ai-badge-disconnected',
      color: '#EF4444',
      pulse: true,
    };
  } else if (normalized.includes('RISK') || normalized.includes('LIMIT') || normalized.includes('REJECTED') || normalized.includes('BLOCKED')) {
    config = {
      label: 'RISK LIMIT REACHED',
      icon: ShieldAlert,
      bgClass: 'ai-badge-risk',
      color: '#EF4444',
    };
  } else if (normalized.includes('CLOSED')) {
    config = {
      label: 'MARKET CLOSED',
      icon: AlertTriangle,
      bgClass: 'ai-badge-closed',
      color: '#94A3B8',
    };
  } else if (normalized.includes('STOPPED')) {
    config = {
      label: 'STOPPED',
      icon: PauseCircle,
      bgClass: 'ai-badge-stopped',
      color: 'var(--text-muted, #64748B)',
    };
  } else if (normalized.includes('WAIT')) {
    config = {
      label: 'WAITING',
      icon: Clock,
      bgClass: 'ai-badge-waiting',
      color: '#60A5FA',
    };
  }

  const IconComponent = config.icon;
  const isSmall = size === 'sm';

  return (
    <span
      className={`ai-status-badge ${config.bgClass} ${isSmall ? 'badge-sm' : ''} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? '4px' : '6px',
        padding: isSmall ? '3px 8px' : '5px 12px',
        borderRadius: '20px',
        fontSize: isSmall ? '0.68rem' : '0.74rem',
        fontWeight: '700',
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        transition: 'all 0.3s ease',
        background: 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${config.color}40`,
        color: config.color,
      }}
    >
      <IconComponent
        size={isSmall ? 12 : 14}
        className={config.spin ? 'spin-anim' : ''}
        style={{ color: config.color }}
      />
      {config.pulse && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: config.color,
            boxShadow: `0 0 6px ${config.color}`,
          }}
        />
      )}
      <span>{config.label}</span>
    </span>
  );
}
