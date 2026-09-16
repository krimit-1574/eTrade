/**
 * Data contracts and constants for AI Intraday Market Scanner
 */

export const MARKET_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
};

export const BIAS_TYPES = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  WAIT: 'WAIT',
};

export const AI_STATES = {
  READY: 'READY',
  ANALYSING: 'ANALYSING',
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
};

export const ERROR_TYPES = {
  NO_CONNECTION: 'NO_CONNECTION',
  RATE_LIMIT: 'RATE_LIMIT',
  STALE_DATA: 'STALE_DATA',
  INCOMPLETE_OHLC: 'INCOMPLETE_OHLC',
  UNKNOWN: 'UNKNOWN',
};
