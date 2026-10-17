/**
 * MarketContextService.js
 * 
 * Provides Indian market-level context (NIFTY 50, BANK NIFTY, SENSEX, Sectors),
 * determines general market regime, calculates sector relative strength,
 * and manages configurable exchange hours and intraday cutoff rules.
 * 
 * PAPER TRADING ONLY.
 */

import { api } from '../../api';

// ─── Default Exchange Timings (NSE India - IST UTC+5:30) ─────────
export const DEFAULT_EXCHANGE_CONFIG = {
  timezoneOffsetHours: 5.5, // IST is UTC + 5:30
  preMarketStart: 900,      // 09:00 IST
  marketStart: 915,         // 09:15 IST
  intradayCutoff: 1515,     // 15:15 IST (no new positions; auto square-off)
  marketClose: 1530,        // 15:30 IST
};

// ─── Sector Index Mapping ─────────────────────────────────────────
export const SECTOR_MAP = {
  BANKING: {
    indexSymbol: '^NSEBANK',
    name: 'NIFTY BANK',
    stocks: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'PNB', 'BANKBARODA'],
  },
  IT: {
    indexSymbol: '^CNXIT',
    name: 'NIFTY IT',
    stocks: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'],
  },
  AUTO: {
    indexSymbol: '^CNXAUTO',
    name: 'NIFTY AUTO',
    stocks: ['TATAMOTORS', 'MARUTI', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO'],
  },
  ENERGY_OIL: {
    indexSymbol: '^CNXENERGY',
    name: 'NIFTY ENERGY',
    stocks: ['RELIANCE', 'NTPC', 'POWERGRID', 'COALINDIA', 'TATAPOWER', 'GAIL'],
  },
  METALS: {
    indexSymbol: '^CNXMETAL',
    name: 'NIFTY METAL',
    stocks: ['TATASTEEL', 'VEDL', 'SAIL', 'HINDALCO', 'JINDALSTEL'],
  },
  FINANCIAL: {
    indexSymbol: '^CNXFIN',
    name: 'NIFTY FIN SERVICE',
    stocks: ['BAJFINANCE', 'BAJAJFINSV', 'JIOFIN', 'RECLTD', 'IRFC'],
  },
  PHARMA: {
    indexSymbol: '^CNXPHARMA',
    name: 'NIFTY PHARMA',
    stocks: ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'DIVISLAB'],
  },
};

// ─── Market Regimes ───────────────────────────────────────────────
export const MARKET_REGIMES = {
  STRONG_BULLISH: 'STRONG_BULLISH',
  BULLISH: 'BULLISH',
  NEUTRAL: 'NEUTRAL',
  BEARISH: 'BEARISH',
  STRONG_BEARISH: 'STRONG_BEARISH',
  HIGH_VOLATILITY: 'HIGH_VOLATILITY',
  RANGE_BOUND: 'RANGE_BOUND',
};

const INDEX_DEFINITIONS = [
  { symbol: '^NSEI', name: 'NIFTY 50' },
  { symbol: '^NSEBANK', name: 'BANK NIFTY' },
  { symbol: '^BSESN', name: 'SENSEX' },
];
const MAX_BENCHMARK_AGE_MS = 90_000;
const MAX_FUTURE_SKEW_MS = 30_000;

function unavailableIndex(definition) {
  return {
    ...definition,
    price: 'N/A',
    change: 'N/A',
    changePct: 'N/A',
    isStaleData: true,
  };
}

function neutralUnavailableRegime() {
  return {
    regime: MARKET_REGIMES.NEUTRAL,
    label: 'Benchmark Data Unavailable',
    description: 'Fresh NIFTY and BANK NIFTY quotes are unavailable; benchmark context is excluded from trading signals.',
    bias: 'NEUTRAL',
    scoreWeight: 0,
  };
}

function parseFreshIndex(result, definition) {
  if (result?.status !== 'fulfilled' || !result.value || result.value.is_delayed !== false) {
    return unavailableIndex(definition);
  }

  const quote = result.value;
  const quoteTime = quote.as_of_precision === 'timestamp'
    ? new Date(quote.as_of).getTime()
    : Number.NaN;
  const advertisedLimit = Number(quote.freshness_limit_seconds);
  const freshnessLimit = Number.isFinite(advertisedLimit) && advertisedLimit > 0
    ? Math.min(MAX_BENCHMARK_AGE_MS, advertisedLimit * 1000)
    : MAX_BENCHMARK_AGE_MS;
  const age = Date.now() - quoteTime;
  const price = Number(quote.price);
  const change = Number(quote.change);
  const changePct = Number(quote.pct ?? quote.changePct);
  if (
    !Number.isFinite(quoteTime)
    || age < -MAX_FUTURE_SKEW_MS
    || age > freshnessLimit
    || !Number.isFinite(price)
    || price <= 0
    || !Number.isFinite(change)
    || !Number.isFinite(changePct)
  ) {
    return unavailableIndex(definition);
  }

  return {
    ...definition,
    price,
    change,
    changePct,
    isStaleData: false,
    asOf: quote.as_of,
  };
}

export const MarketContextService = {

  /**
   * Evaluates current market state based on configurable exchange hours.
   */
  getMarketSessionState(config = DEFAULT_EXCHANGE_CONFIG) {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istTime = new Date(utc + (3600000 * config.timezoneOffsetHours));

    const day = istTime.getDay(); // 0 = Sun, 6 = Sat
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const timeNum = hours * 100 + minutes;

    // Weekend check
    if (day === 0 || day === 6) {
      return {
        status: 'CLOSED',
        isTradingAllowed: false,
        isPastCutoff: true,
        reason: 'Weekend Market Closed',
        currentTimeIST: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      };
    }

    // Pre-Market (09:00 - 09:15)
    if (timeNum >= config.preMarketStart && timeNum < config.marketStart) {
      return {
        status: 'PRE-MARKET',
        isTradingAllowed: false,
        isPastCutoff: false,
        reason: 'Pre-Market Discovery Session',
        currentTimeIST: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      };
    }

    // Near Close / Past Cutoff (15:15 - 15:30)
    if (timeNum >= config.intradayCutoff && timeNum < config.marketClose) {
      return {
        status: 'NEAR CLOSE',
        isTradingAllowed: false, // Disallow new intraday positions
        isPastCutoff: true,
        reason: 'Intraday Cutoff Reached (15:15 IST) - Positions Square-Off Phase',
        currentTimeIST: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      };
    }

    // Active Market Hours (09:15 - 15:15)
    if (timeNum >= config.marketStart && timeNum < config.intradayCutoff) {
      return {
        status: 'OPEN',
        isTradingAllowed: true,
        isPastCutoff: false,
        reason: 'Regular Live Trading Session',
        currentTimeIST: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      };
    }

    // After Hours / Closed
    return {
      status: 'CLOSED',
      isTradingAllowed: false,
      isPastCutoff: true,
      reason: 'Exchange Session Closed (Trading hours: 09:15 - 15:30 IST)',
      currentTimeIST: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
    };
  },

  /**
   * Determines general market regime from index returns & volatility.
   */
  determineMarketRegime(niftyChangePct, bankNiftyChangePct, _atrOrVol = 0) {
    const avgChange = (niftyChangePct + bankNiftyChangePct) / 2;
    const spread = Math.abs(niftyChangePct - bankNiftyChangePct);

    if (spread > 1.8) {
      return {
        regime: MARKET_REGIMES.HIGH_VOLATILITY,
        label: 'High Volatility',
        description: 'Divergence between NIFTY and BANK NIFTY indicating elevated sectoral dispersion.',
        bias: 'WAIT',
        scoreWeight: -5,
      };
    }

    if (avgChange >= 1.2) {
      return {
        regime: MARKET_REGIMES.STRONG_BULLISH,
        label: 'Strong Bullish',
        description: 'Broad-based rally across benchmark indices supporting long momentum.',
        bias: 'LONG',
        scoreWeight: +10,
      };
    }

    if (avgChange >= 0.3) {
      return {
        regime: MARKET_REGIMES.BULLISH,
        label: 'Bullish',
        description: 'Positive index breath supporting upside breakout setups.',
        bias: 'LONG',
        scoreWeight: +5,
      };
    }

    if (avgChange <= -1.2) {
      return {
        regime: MARKET_REGIMES.STRONG_BEARISH,
        label: 'Strong Bearish',
        description: 'Heavy institutional distribution across indices favoring short setups.',
        bias: 'SHORT',
        scoreWeight: +10, // Supports short
      };
    }

    if (avgChange <= -0.3) {
      return {
        regime: MARKET_REGIMES.BEARISH,
        label: 'Bearish',
        description: 'Negative index bias creating drag on long breakouts.',
        bias: 'SHORT',
        scoreWeight: +5,
      };
    }

    if (Math.abs(avgChange) < 0.3) {
      return {
        regime: MARKET_REGIMES.RANGE_BOUND,
        label: 'Range Bound',
        description: 'Flat benchmark indices with compressed ATR. Prioritize VWAP mean-reversion.',
        bias: 'NEUTRAL',
        scoreWeight: 0,
      };
    }

    return {
      regime: MARKET_REGIMES.NEUTRAL,
      label: 'Neutral',
      description: 'Balanced market pressure.',
      bias: 'NEUTRAL',
      scoreWeight: 0,
    };
  },

  /**
   * Identifies the sector and returns relative strength comparison.
   */
  getSectorForStock(symbol) {
    const cleanSym = (symbol || '').toUpperCase().replace('.NS', '').replace('.BO', '');
    for (const [sectorKey, sector] of Object.entries(SECTOR_MAP)) {
      if (sector.stocks.includes(cleanSym)) {
        return { sectorKey, ...sector };
      }
    }
    return {
      sectorKey: 'GENERAL',
      indexSymbol: '^NSEI',
      name: 'NIFTY 50',
      stocks: [],
    };
  },

  /**
   * Compares stock performance to sector/market benchmark.
   */
  compareRelativeStrength(stockChangePct, sectorChangePct) {
    const diff = stockChangePct - sectorChangePct;
    let strength = 'NEUTRAL';
    let label = 'In Line';

    if (diff >= 1.0) {
      strength = 'LEADER';
      label = `Outperforming sector by +${diff.toFixed(2)}%`;
    } else if (diff <= -1.0) {
      strength = 'LAGGARD';
      label = `Underperforming sector by ${diff.toFixed(2)}%`;
    } else if (diff > 0) {
      strength = 'SLIGHT_LEAD';
      label = `Mildly leading (+${diff.toFixed(2)}%)`;
    } else {
      strength = 'SLIGHT_LAG';
      label = `Mildly trailing (${diff.toFixed(2)}%)`;
    }

    return { diff: parseFloat(diff.toFixed(2)), strength, label };
  },

  /**
   * Fetches or calculates snapshot of key market indices.
   */
  async fetchMarketIndices() {
    try {
      const [niftyRes, bankRes, sensexRes] = await Promise.allSettled([
        api.getPrice('^NSEI'),
        api.getPrice('^NSEBANK'),
        api.getPrice('^BSESN'),
      ]);

      const nifty = parseFreshIndex(niftyRes, INDEX_DEFINITIONS[0]);
      const bank = parseFreshIndex(bankRes, INDEX_DEFINITIONS[1]);
      const sensex = parseFreshIndex(sensexRes, INDEX_DEFINITIONS[2]);
      const benchmarkIsFresh = !nifty.isStaleData && !bank.isStaleData;
      const regime = benchmarkIsFresh
        ? this.determineMarketRegime(nifty.changePct, bank.changePct)
        : neutralUnavailableRegime();

      return {
        indices: [nifty, bank, sensex],
        regime,
        isStaleData: !benchmarkIsFresh,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('MarketContextService: Failed to fetch live index quotes:', err);
      return {
        indices: INDEX_DEFINITIONS.map(unavailableIndex),
        regime: neutralUnavailableRegime(),
        isStaleData: true,
        timestamp: new Date().toISOString(),
      };
    }
  },
};
