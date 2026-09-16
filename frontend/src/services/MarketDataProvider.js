/**
 * MarketDataProvider
 * Abstraction layer for fetching intraday stock market scanner data.
 * Interfaces with the backend API (/api/screener/intraday) and provides
 * a clean fallback provider if network or rate limit issues occur.
 */

import { ERROR_TYPES, MARKET_STATUS } from './MarketDataTypes';

// Realistic Fallback Provider dataset (clearly labeled if backend is disconnected)
const FALLBACK_UNIVERSE = [
  { rank: 1, sym: 'RELIANCE', name: 'Reliance Industries Ltd.', price: 2945.35, changePct: 1.21, high: 2965.00, low: 2912.40, volume: '8.45M', rvol: 1.85, trend: 'Bullish', aiScore: 91, aiConfidence: 84, bias: 'LONG', vwap: 2938.50 },
  { rank: 2, sym: 'TCS', name: 'Tata Consultancy Services', price: 4120.50, changePct: -0.45, high: 4155.00, low: 4098.20, volume: '3.20M', rvol: 1.42, trend: 'Bearish', aiScore: 88, aiConfidence: 81, bias: 'SHORT', vwap: 4135.00 },
  { rank: 3, sym: 'HDFCBANK', name: 'HDFC Bank Ltd.', price: 1450.25, changePct: 0.85, high: 1462.00, low: 1438.50, volume: '12.5M', rvol: 1.65, trend: 'Bullish', aiScore: 85, aiConfidence: 78, bias: 'LONG', vwap: 1445.80 },
  { rank: 4, sym: 'INFY', name: 'Infosys Ltd.', price: 1630.80, changePct: 1.42, high: 1645.00, low: 1610.00, volume: '6.10M', rvol: 1.90, trend: 'Strong Bullish', aiScore: 83, aiConfidence: 86, bias: 'LONG', vwap: 1622.40 },
  { rank: 5, sym: 'ICICIBANK', name: 'ICICI Bank Ltd.', price: 1125.40, changePct: -0.22, high: 1135.00, low: 1118.00, volume: '9.80M', rvol: 1.10, trend: 'Consolidating', aiScore: 79, aiConfidence: 74, bias: 'WAIT', vwap: 1126.10 },
  { rank: 6, sym: 'TATAMOTORS', name: 'Tata Motors Ltd.', price: 985.60, changePct: 2.15, high: 994.50, low: 968.00, volume: '15.3M', rvol: 2.15, trend: 'Bullish', aiScore: 77, aiConfidence: 89, bias: 'LONG', vwap: 978.20 },
  { rank: 7, sym: 'BHARTIARTL', name: 'Bharti Airtel Ltd.', price: 1220.75, changePct: 1.10, high: 1232.00, low: 1208.00, volume: '4.70M', rvol: 1.35, trend: 'Bullish', aiScore: 75, aiConfidence: 82, bias: 'LONG', vwap: 1215.00 },
  { rank: 8, sym: 'SBIN', name: 'State Bank of India', price: 782.30, changePct: -0.75, high: 791.00, low: 776.50, volume: '11.2M', rvol: 1.25, trend: 'Bearish', aiScore: 72, aiConfidence: 71, bias: 'SHORT', vwap: 786.50 },
  { rank: 9, sym: 'LT', name: 'Larsen & Toubro Ltd.', price: 3625.00, changePct: 1.65, high: 3648.00, low: 3580.00, volume: '2.90M', rvol: 1.55, trend: 'Bullish', aiScore: 70, aiConfidence: 79, bias: 'LONG', vwap: 3610.00 },
  { rank: 10, sym: 'BAJFINANCE', name: 'Bajaj Finance Ltd.', price: 6950.00, changePct: 0.92, high: 7010.00, low: 6890.00, volume: '1.80M', rvol: 1.05, trend: 'Consolidating', aiScore: 68, aiConfidence: 75, bias: 'WAIT', vwap: 6940.00 },
];

export const MarketDataProvider = {
  /**
   * Fetches real intraday market scanner data from backend API.
   * If backend is offline or returns error, falls back safely to clean provider fallback.
   */
  async fetchIntradayScan(forceRefresh = false) {
    try {
      const url = forceRefresh ? '/api/screener/intraday/refresh' : '/api/screener/intraday';
      const method = forceRefresh ? 'POST' : 'GET';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(ERROR_TYPES.RATE_LIMIT);
        }
        throw new Error(`API HTTP Error ${response.status}`);
      }

      const data = await response.json();

      return {
        success: true,
        isFallback: false,
        dataSource: data.dataSource || 'Yahoo Finance (NSE Live Market Data)',
        marketStatus: data.marketStatus || MARKET_STATUS.OPEN,
        marketStatusNote: data.marketStatusNote || '',
        lastAnalysed: data.lastAnalysed || new Date().toLocaleTimeString('en-US', { hour12: true }),
        opportunities: data.opportunities || [],
        totalScanned: data.totalScanned || 0,
        error: null,
      };
    } catch (err) {
      console.warn('MarketDataProvider: Live API request failed, engaging Fallback Provider:', err.message);

      const formattedTime = new Date().toLocaleTimeString('en-US', { hour12: true });
      let errorType = ERROR_TYPES.NO_CONNECTION;
      let errorMsg = 'Backend API unreachable. Using Fallback Market Provider.';

      if (err.message === ERROR_TYPES.RATE_LIMIT) {
        errorType = ERROR_TYPES.RATE_LIMIT;
        errorMsg = 'API rate limit reached. Displaying cached fallback data.';
      }

      return {
        success: false,
        isFallback: true,
        dataSource: 'MarketDataProvider [Fallback Mode]',
        marketStatus: MARKET_STATUS.CLOSED,
        marketStatusNote: 'Fallback Provider Active (API Offline)',
        lastAnalysed: formattedTime,
        opportunities: FALLBACK_UNIVERSE,
        totalScanned: FALLBACK_UNIVERSE.length,
        error: {
          type: errorType,
          message: errorMsg,
        },
      };
    }
  },
};
