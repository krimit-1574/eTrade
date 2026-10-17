import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api', () => ({
  api: {
    getPrice: vi.fn(),
  },
}));

import { api } from '../../../api';
import { MARKET_REGIMES, MarketContextService } from '../MarketContextService';

function freshQuote(symbol, price, pct) {
  return {
    symbol,
    price: String(price),
    change: String((price * pct) / 100),
    pct: String(pct),
    as_of: new Date().toISOString(),
    as_of_precision: 'timestamp',
    freshness_limit_seconds: 90,
    is_delayed: false,
  };
}

describe('MarketContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('derives market bias only from fresh timestamped benchmark quotes', async () => {
    api.getPrice
      .mockResolvedValueOnce(freshQuote('^NSEI', 25000, 1.5))
      .mockResolvedValueOnce(freshQuote('^NSEBANK', 52000, 1.1))
      .mockResolvedValueOnce(freshQuote('^BSESN', 82000, 1.2));

    const context = await MarketContextService.fetchMarketIndices();

    expect(context.isStaleData).toBe(false);
    expect(context.regime.regime).toBe(MARKET_REGIMES.STRONG_BULLISH);
    expect(context.regime.bias).toBe('LONG');
  });

  it('treats the 15:30 IST boundary as market closed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T10:00:00.000Z'));
    try {
      expect(MarketContextService.getMarketSessionState().status).toBe('CLOSED');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses neutral unavailable context instead of fabricated prices when benchmarks are stale', async () => {
    api.getPrice
      .mockResolvedValueOnce({ ...freshQuote('^NSEI', 25000, 2), is_delayed: true })
      .mockResolvedValueOnce({
        ...freshQuote('^NSEBANK', 52000, 2),
        as_of: new Date(Date.now() - 91_000).toISOString(),
      })
      .mockRejectedValueOnce(new Error('offline'));

    const context = await MarketContextService.fetchMarketIndices();

    expect(context.isStaleData).toBe(true);
    expect(context.regime.regime).toBe(MARKET_REGIMES.NEUTRAL);
    expect(context.regime.bias).toBe('NEUTRAL');
    expect(context.indices.every(index => index.price === 'N/A')).toBe(true);
  });
});
