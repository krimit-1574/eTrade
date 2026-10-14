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
    const opportunities = Array.isArray(rawResult?.opportunities) ? rawResult.opportunities : [];

    if (opportunities.length === 0) {
      return {
        ...(rawResult || {}),
        opportunities: [],
      };
    }

    // Ensure all items are scored using IntradayScoreEngine
    const scoredOpportunities = opportunities
      .filter(item => item && typeof item === 'object')
      .map((item) => {
      // Preserve a server score only when the complete score contract is valid.
      const score = Number(item.aiScore);
      const confidence = Number(item.aiConfidence);
      const bias = String(item.bias || '').toUpperCase();
      if (
        Number.isFinite(score) && score >= 0 && score <= 100 &&
        Number.isFinite(confidence) && confidence >= 0 && confidence <= 100 &&
        ['LONG', 'SHORT', 'WAIT'].includes(bias)
      ) {
        return item;
      }
      return IntradayScoreEngine.scoreStock(item);
    });

    // Re-rank candidates by AI Score descending
    scoredOpportunities.sort((a, b) => Number(b.aiScore || 0) - Number(a.aiScore || 0));

    // A duplicated backend row should never create duplicated table actions or
    // competing ranks for the same singleton AI session.
    const seenSymbols = new Set();
    const uniqueOpportunities = scoredOpportunities.filter(item => {
      const symbol = String(item.sym || item.symbol || '').trim().toUpperCase().replace(/\.NS$/, '');
      if (!symbol || seenSymbols.has(symbol)) return false;
      seenSymbols.add(symbol);
      return true;
    });

    const top10 = uniqueOpportunities.slice(0, 10).map((stock, index) => ({
      ...stock,
      rank: index + 1,
    }));

    return {
      ...rawResult,
      opportunities: top10,
    };
  },
};
