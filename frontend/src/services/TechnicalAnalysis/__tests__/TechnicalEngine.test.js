import { describe, it, expect } from 'vitest';
import { IndicatorEngine } from '../IndicatorEngine';
import { CandlestickPatternDetector } from '../CandlestickPatternDetector';
import { MarketStructureAnalyzer } from '../MarketStructureAnalyzer';
import { SetupAnalyzer } from '../SetupAnalyzer';
import { AITradingDecisionEngine } from '../AITradingDecisionEngine';
import { RiskManager } from '../RiskManager';

describe('Technical Analysis Engine', () => {
  
  // Mock Data
  const generateMockTrendData = (length, startPrice, trend) => {
    let data = [];
    let currentPrice = startPrice;
    for (let i = 0; i < length; i++) {
      const open = currentPrice;
      const close = trend === 'up' ? open + 2 : (trend === 'down' ? open - 2 : open + (Math.random() - 0.5) * 2);
      const high = Math.max(open, close) + 1;
      const low = Math.min(open, close) - 1;
      data.push({ time: i, open, high, low, close, volume: 1000 + i * 10 });
      currentPrice = close;
    }
    return data;
  };

  describe('IndicatorEngine', () => {
    it('calculates SMA correctly', () => {
      const data = [{ close: 10 }, { close: 11 }, { close: 12 }];
      expect(IndicatorEngine.SMA(data, 3)).toBe(11);
    });

    it('returns null when insufficient data for SMA', () => {
      const data = [{ close: 10 }];
      expect(IndicatorEngine.SMA(data, 3)).toBeNull();
    });

    it('calculates Volume Average correctly', () => {
      const data = [{ volume: 100 }, { volume: 200 }];
      expect(IndicatorEngine.VolumeAverage(data, 2)).toBe(150);
    });
  });

  describe('CandlestickPatternDetector', () => {
    it('detects a Bullish Engulfing pattern', () => {
      const data = [
        { open: 10, high: 11, low: 8, close: 8 }, // Bearish
        { open: 7, high: 12, low: 6, close: 11 }  // Bullish engulfing
      ];
      expect(CandlestickPatternDetector.isBullishEngulfing(data)).toBe(true);
      expect(CandlestickPatternDetector.isBearishEngulfing(data)).toBe(false);
    });

    it('detects a Bearish Engulfing pattern', () => {
      const data = [
        { open: 8, high: 11, low: 7, close: 10 }, // Bullish
        { open: 11, high: 12, low: 6, close: 7 }  // Bearish engulfing
      ];
      expect(CandlestickPatternDetector.isBearishEngulfing(data)).toBe(true);
    });

    it('detects a Doji', () => {
      const data = [
        { open: 10, high: 12, low: 8, close: 10.05 } // Body is very small compared to range
      ];
      expect(CandlestickPatternDetector.isDoji(data)).toBe(true);
    });
  });

  describe('MarketStructureAnalyzer', () => {
    it('identifies swing highs and lows', () => {
      const data = [
        { high: 10, low: 5, time: 1 },
        { high: 12, low: 6, time: 2 }, // Swing high
        { high: 11, low: 4, time: 3 }, // Swing low
        { high: 13, low: 5, time: 4 },
        { high: 10, low: 2, time: 5 }
      ];
      const { swingHighs, swingLows } = MarketStructureAnalyzer.findSwings(data, 1);
      expect(swingHighs.length).toBeGreaterThan(0);
      expect(swingLows.length).toBeGreaterThan(0);
    });
  });

  describe('SetupAnalyzer', () => {
    it('generates a valid analysis object for a strong uptrend', () => {
      const mockData = generateMockTrendData(100, 100, 'up');
      const analysis = SetupAnalyzer.analyze('TEST', mockData);
      
      expect(analysis).not.toBeNull();
      expect(analysis.symbol).toBe('TEST');
      expect(analysis.trend).toBe('bullish');
      expect(analysis.priceVsVWAP).toBe('above'); // In a strong pure uptrend, price is above VWAP
      expect(typeof analysis.explanation).toBe('string');
      expect(analysis.setupStrength).toBeGreaterThan(50);
    });

    it('generates a valid analysis object for a downtrend', () => {
      const mockData = generateMockTrendData(100, 100, 'down');
      const analysis = SetupAnalyzer.analyze('TEST', mockData);
      
      expect(analysis.trend).toBe('bearish');
      expect(analysis.priceVsVWAP).toBe('below');
      expect(analysis.setupStrength).toBeLessThan(50);
    });
  });

  describe('RiskManager', () => {
    it('calculates long risk properly', () => {
      const risk = RiskManager.calculateLongRisk(100, 2, 95);
      // ATR is 2, stop multiplier is 1.5. SL = 100 - 3 = 97.
      // Support is 95, so we use support 95 (actually 0.2% below it = 94.81) if it's within max stop.
      // But 100 to 94.81 is > 2% max stop. So max stop is 100 * 0.98 = 98.
      expect(risk.stopLoss).toBe(98);
      expect(risk.target1).toBe(103);
    });
  });

  describe('AITradingDecisionEngine', () => {
    it('returns WAIT for neutral setups', () => {
      const mockAnalysis = {
        setup: 'neutral_monitoring',
        setupStrength: 50
      };
      const decision = AITradingDecisionEngine.evaluate(mockAnalysis, 100);
      expect(decision.decision).toBe('WAIT');
      expect(decision.direction).toBe('NONE');
    });

    it('returns BUY for strong long breakouts', () => {
      const mockAnalysis = {
        setup: 'potential_long_breakout',
        setupStrength: 80,
        relativeVolume: 2.0,
        priceVsVWAP: 'above',
        trend: 'bullish',
        atr: 1,
        support: 99
      };
      const decision = AITradingDecisionEngine.evaluate(mockAnalysis, 100);
      expect(decision.decision).toBe('BUY');
      expect(decision.direction).toBe('LONG');
      expect(decision.stopLoss).toBeDefined();
    });
  });
});
