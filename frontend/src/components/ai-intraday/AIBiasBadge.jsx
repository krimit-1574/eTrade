import React from 'react';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';

export const BIAS_TYPES = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  WAIT: 'WAIT',
};

export default function AIBiasBadge({ bias = BIAS_TYPES.LONG, size = 'md', className = '' }) {
  const normalizedBias = (bias || '').toUpperCase();

  let config = {
    label: 'LONG',
    icon: TrendingUp,
    bgClass: 'bias-badge-long',
  };

  if (normalizedBias === BIAS_TYPES.SHORT) {
    config = {
      label: 'SHORT',
      icon: TrendingDown,
      bgClass: 'bias-badge-short',
    };
  } else if (normalizedBias === BIAS_TYPES.WAIT) {
    config = {
      label: 'WAIT',
      icon: Clock,
      bgClass: 'bias-badge-wait',
    };
  }

  const IconComponent = config.icon;
  const isSmall = size === 'sm';

  return (
    <span
      className={`bias-badge ${config.bgClass} ${isSmall ? 'badge-sm' : ''} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isSmall ? '4px' : '6px',
        padding: isSmall ? '3px 8px' : '5px 12px',
        borderRadius: '8px',
        fontSize: isSmall ? '0.7rem' : '0.78rem',
        fontWeight: '800',
        letterSpacing: '0.8px',
        textTransform: 'uppercase',
      }}
    >
      <IconComponent size={isSmall ? 12 : 14} />
      <span>{config.label}</span>
    </span>
  );
}
