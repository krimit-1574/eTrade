/**
 * IntradayScanner
 * High-level orchestrator service for running intraday market scans,
 * scoring stocks via IntradayScoreEngine, and ranking the top 10 opportunities.
 */

import { MarketDataProvider } from './MarketDataProvider';
import { IntradayScoreEngine } from './IntradayScoreEngine';

export const IntradayScanner = {
  /**
   * Scans available market universe and returns top ranked stock opportunities.
   */
  async scanMarket(forceRefresh = false) {
    const rawResult = await MarketDataProvider.fetchIntradayScan(forceRefresh);

    if (!rawResult.opportunities || rawResult.opportunities.length === 0) {
      return {
        ...rawResult,
        opportunities: [],
      };
    }

    // Ensure all items are scored using IntradayScoreEngine
    const scoredOpportunities = rawResult.opportunities.map((item) => {
      // If server already provided calculated aiScore and bias, keep them or verify
      if (item.aiScore && item.bias && item.aiConfidence) {
        return item;
      }
      return IntradayScoreEngine.scoreStock(item);
    });

    // Re-rank candidates by AI Score descending
    scoredOpportunities.sort((a, b) => b.aiScore - a.aiScore);

    const top10 = scoredOpportunities.slice(0, 10).map((stock, index) => ({
      ...stock,
      rank: index + 1,
    }));

    return {
      ...rawResult,
      opportunities: top10,
    };
  },
};
