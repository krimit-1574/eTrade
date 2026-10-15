import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getIntradayScan: vi.fn(),
  refreshIntradayScan: vi.fn(),
}));

vi.mock('../../../api', () => ({
  api: apiMocks,
}));

import { MarketDataProvider } from '../../MarketDataProvider';

describe('MarketDataProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the shared authenticated API client for forced refreshes', async () => {
    apiMocks.refreshIntradayScan.mockResolvedValue({
      opportunities: [{ sym: 'TCS' }],
      totalScanned: 1,
      dataSource: 'test',
      marketStatus: 'OPEN',
    });

    const result = await MarketDataProvider.fetchIntradayScan(true);

    expect(apiMocks.refreshIntradayScan).toHaveBeenCalledOnce();
    expect(apiMocks.getIntradayScan).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.opportunities).toEqual([{ sym: 'TCS' }]);
  });

  it('uses the public scan wrapper for ordinary reads', async () => {
    apiMocks.getIntradayScan.mockResolvedValue({
      opportunities: [],
      totalScanned: 0,
    });

    const result = await MarketDataProvider.fetchIntradayScan(false);

    expect(apiMocks.getIntradayScan).toHaveBeenCalledOnce();
    expect(apiMocks.refreshIntradayScan).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
