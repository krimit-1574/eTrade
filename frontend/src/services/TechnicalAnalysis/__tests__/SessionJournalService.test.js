import { describe, it, expect } from 'vitest';
import { SessionJournalService } from '../SessionJournalService';

describe('SessionJournalService', () => {

  describe('calculateAnalytics', () => {
    it('handles empty trades list gracefully', () => {
      const result = SessionJournalService.calculateAnalytics([], 100000, 100000);
      expect(result.totalTrades).toBe(0);
      expect(result.winners).toBe(0);
      expect(result.losers).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.netPnL).toBe(0);
      expect(result.equityCurve).toEqual([100000]);
    });

    it('accurately calculates win rate, profit factor, net P&L and equity curve', () => {
      const mockTrades = [
        { realizedPnL: 1200, riskReward: 2.0, entryTime: '2026-09-16T10:00:00Z', exitTime: '2026-09-16T10:15:00Z' },
        { realizedPnL: -400, riskReward: 1.5, entryTime: '2026-09-16T10:30:00Z', exitTime: '2026-09-16T10:40:00Z' },
        { realizedPnL: 800, riskReward: 1.8, entryTime: '2026-09-16T11:00:00Z', exitTime: '2026-09-16T11:25:00Z' },
        { realizedPnL: -200, riskReward: 1.2, entryTime: '2026-09-16T11:40:00Z', exitTime: '2026-09-16T11:50:00Z' },
      ];

      const analytics = SessionJournalService.calculateAnalytics(mockTrades, 100000, 101400);

      expect(analytics.totalTrades).toBe(4);
      expect(analytics.winners).toBe(2);
      expect(analytics.losers).toBe(2);
      expect(analytics.winRate).toBe(50);
      expect(analytics.grossProfit).toBe(2000);
      expect(analytics.grossLoss).toBe(600);
      expect(analytics.netPnL).toBe(1400);
      expect(analytics.netPnLPct).toBe(1.4);
      expect(analytics.largestWinner).toBe(1200);
      expect(analytics.largestLoser).toBe(-400);
      expect(analytics.avgWinner).toBe(1000);
      expect(analytics.avgLoser).toBe(300);
      expect(analytics.profitFactor).toBe(3.33);
      // Equity curve: [100000, 101200, 100800, 101600, 101400]
      expect(analytics.equityCurve).toEqual([100000, 101200, 100800, 101600, 101400]);
      expect(analytics.maxDrawdown).toBe(400);
    });

    it('handles all-winner session with infinite profit factor symbol', () => {
      const mockTrades = [
        { realizedPnL: 500, riskReward: 2.0 },
        { realizedPnL: 750, riskReward: 2.5 },
      ];
      const analytics = SessionJournalService.calculateAnalytics(mockTrades, 100000, 101250);
      expect(analytics.winRate).toBe(100);
      expect(analytics.profitFactor).toBe('∞');
      expect(analytics.grossLoss).toBe(0);
      expect(analytics.maxDrawdown).toBe(0);
    });
  });

  describe('generateTradeExplanation', () => {
    it('produces structured, data-driven entry and risk explanations', () => {
      const trade = {
        direction: 'LONG',
        entryPrice: 2500,
        stopLoss: 2475,
        target1: 2540,
        target2: 2580,
        setup: 'ORB_5M_BREAKOUT',
        confidence: 85,
        riskReward: 1.6,
      };

      const explanation = SessionJournalService.generateTradeExplanation(trade);

      expect(explanation).toBeDefined();
      expect(explanation.entry).toContain('LONG');
      expect(explanation.entry).toContain('₹2500');
      expect(explanation.entry).toContain('85%');
      expect(explanation.stop).toContain('₹2475');
      expect(explanation.target).toContain('Target 1 (₹2540.00)');
      expect(explanation.target).toContain('Target 2 (₹2580.00)');
    });
  });

  describe('generateRetrospective', () => {
    it('generates high grade and positive critique for hitting targets', () => {
      const trade = {
        direction: 'LONG',
        entryPrice: 1000,
        exitPrice: 1040,
        target1: 1030,
        target2: 1050,
        realizedPnL: 800,
        exitReason: 'Target 1 hit. Scaled out 50% profit.',
      };

      const retro = SessionJournalService.generateRetrospective(trade);
      expect(['A+', 'A']).toContain(retro.grade);
      expect(retro.executionQuality).toBe('EXCELLENT');
      expect(retro.critique).toBeDefined();
      expect(retro.keyTakeaways.length).toBeGreaterThan(0);
    });

    it('generates controlled risk critique for planned stop hit', () => {
      const trade = {
        direction: 'LONG',
        entryPrice: 1000,
        exitPrice: 980,
        stopLoss: 980,
        realizedPnL: -400,
        exitReason: 'Stop-loss hit at ₹980',
      };

      const retro = SessionJournalService.generateRetrospective(trade);
      expect(retro.executionQuality).toBe('ACCEPTABLE_LOSS');
      expect(retro.critique).toContain('disciplined risk control');
    });
  });

  describe('buildSessionPayload', () => {
    it('creates a complete enriched session payload', () => {
      const mockAccount = {
        initialCapital: 100000,
        accountValue: 102500,
        realizedPnL: 2500,
        createdAt: '2026-09-16T09:15:00Z',
        closedPositions: [
          {
            symbol: 'RELIANCE',
            direction: 'LONG',
            quantity: 50,
            entryPrice: 2500,
            exitPrice: 2550,
            entryTime: '2026-09-16T09:30:00Z',
            exitTime: '2026-09-16T10:00:00Z',
            stopLoss: 2475,
            target1: 2550,
            target2: 2590,
            realizedPnL: 2500,
            pnlPct: 2.0,
            setup: 'VWAP_PULLBACK',
            confidence: 82,
            riskReward: 2.0,
            exitReason: 'Target 1 hit',
          }
        ]
      };

      const session = SessionJournalService.buildSessionPayload({
        account: mockAccount,
        symbol: 'RELIANCE',
        decisions: [{ decision: 'BUY', confidence: 82, setup: 'VWAP_PULLBACK' }],
        userId: 'trader_1',
      });

      expect(session.symbol).toBe('RELIANCE');
      expect(session.user_id).toBe('trader_1');
      expect(session.starting_capital).toBe(100000);
      expect(session.ending_capital).toBe(102500);
      expect(session.realized_pnl).toBe(2500);
      expect(session.trade_count).toBe(1);
      expect(session.trades[0].explanation).toBeDefined();
      expect(session.trades[0].retrospective).toBeDefined();
      expect(session.analytics.winRate).toBe(100);
    });
  });

  describe('tradesToCSV and Export', () => {
    it('converts trade array to valid CSV string', () => {
      const trades = [
        {
          symbol: 'TCS',
          direction: 'LONG',
          quantity: 20,
          entryPrice: 3500,
          exitPrice: 3550,
          realizedPnL: 1000,
          pnlPct: 1.43,
          setup: 'BREAKOUT',
          exitReason: 'Target hit',
          entryTime: '2026-09-16T10:00:00Z',
          exitTime: '2026-09-16T10:30:00Z',
        }
      ];

      const csv = SessionJournalService.tradesToCSV(trades, { symbol: 'TCS' });
      expect(csv).toContain('Trade #,Symbol,Direction,Quantity');
      expect(csv).toContain('"1","TCS","LONG","20","3500","3550"');
    });
  });

  describe('Persistence (local mirror)', () => {
    it('persists session locally and retrieves it', async () => {
      const session = {
        id: 'session_test_1',
        symbol: 'INFY',
        realized_pnl: 500,
        trade_count: 1,
        created_at: new Date().toISOString(),
      };

      await SessionJournalService.saveSession(session);
      const retrieved = await SessionJournalService.getSessions();
      expect(retrieved.length).toBeGreaterThanOrEqual(1);
      expect(retrieved.find(s => s.id === 'session_test_1')).toBeDefined();
    });
  });
});
