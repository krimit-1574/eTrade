/**
 * IntradayScoreEngine
 * Modular technical scoring module for calculating AI Score (0-100),
 * Bias (LONG/SHORT/WAIT), and Confidence (0-100%) based on calculated OHLC metrics.
 */

import { BIAS_TYPES } from './MarketDataTypes';

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export const IntradayScoreEngine = {
  /**
   * Calculates modular sub-scores, total AI score, bias, and confidence for a stock item.
   */
  scoreStock(stock) {
    const source = stock && typeof stock === 'object' ? stock : {};
    const price = finiteNumber(source.price, finiteNumber(source.currentPrice, 0));
    const high = finiteNumber(source.high, price);
    const low = finiteNumber(source.low, price);
    const open = finiteNumber(source.open, price);
    const vwap = finiteNumber(source.vwap, price);
    const rsi = finiteNumber(source.rsi, 50);
    // Missing/zero volume is not evidence of average participation.
    const rvol = finiteNumber(source.rvol, finiteNumber(source.volumeRatio, 0));
    const changePct = finiteNumber(source.changePct, 0);

    const validMarketData = price > 0 && high > 0 && low > 0 && open > 0 &&
      high >= low && high >= Math.max(open, price) && low <= Math.min(open, price) &&
      vwap > 0 && rsi >= 0 && rsi <= 100 && rvol >= 0;

    if (!validMarketData) {
      return {
        ...source,
        aiScore: 0,
        aiConfidence: 0,
        bias: BIAS_TYPES.WAIT,
        dataQuality: 'INVALID',
        scoreBreakdown: {
          trend: 0,
          momentum: 0,
          volume: 0,
          volatility: 0,
          liquidity: 0,
          breakout: 0,
        },
      };
    }

    const dayRangePct = low > 0 ? ((high - low) / low) * 100 : 0;
    const distFromHighPct = high > 0 ? ((high - price) / high) * 100 : 0;
    const distFromLowPct = low > 0 ? ((price - low) / low) * 100 : 0;

    // 1. Trend Score (0 - 20)
    let trendScore = 0;
    if (price > vwap) trendScore += 12;
    if (changePct > 0) trendScore += 8;

    // 2. Momentum Score (0 - 20)
    let momentumScore = 0;
    if (rsi >= 50 && rsi <= 68) momentumScore += 12;
    else if (rsi >= 35 && rsi < 50) momentumScore += 8;
    else if (rsi > 68) momentumScore += 6;

    const intradayChangePct = open > 0 ? ((price - open) / open) * 100 : 0;
    if (intradayChangePct > 0.8) momentumScore += 8;
    else if (intradayChangePct > 0) momentumScore += 5;

    // 3. Volume Score (0 - 20)
    let volumeScore = 0;
    if (rvol >= 2.0) volumeScore = 20;
    else if (rvol >= 1.5) volumeScore = 16;
    else if (rvol >= 1.2) volumeScore = 12;
    else if (rvol >= 0.9) volumeScore = 8;
    else volumeScore = 4;

    // 4. Volatility Score (0 - 15)
    let volatilityScore = 0;
    if (dayRangePct >= 1.5 && dayRangePct <= 4.5) volatilityScore = 15;
    else if (dayRangePct > 4.5) volatilityScore = 10;
    else if (dayRangePct >= 0.8) volatilityScore = 8;
    else volatilityScore = 4;

    // 5. Liquidity Score (0 - 15)
    let liquidityScore = 12; // High liquidity default for liquid universe

    // 6. Breakout Score (0 - 10)
    let breakoutScore = 0;
    if (distFromHighPct <= 0.6 && rvol >= 1.2) breakoutScore = 10;
    else if (distFromLowPct <= 0.6 && rvol >= 1.2) breakoutScore = 10;
    else if (distFromHighPct <= 1.5 || distFromLowPct <= 1.5) breakoutScore = 6;
    else breakoutScore = 3;

    // Total AI Score (0 - 100)
    const rawScore = trendScore + momentumScore + volumeScore + volatilityScore + liquidityScore + breakoutScore;
    const aiScore = Math.max(10, Math.min(99, Math.round(rawScore)));

    // Determine Bias
    let bias = BIAS_TYPES.WAIT;
    if (aiScore >= 62 && price > vwap && rsi >= 48 && changePct > -0.2) {
      bias = BIAS_TYPES.LONG;
    } else if (aiScore >= 62 && price < vwap && rsi <= 52 && changePct < 0.2) {
      bias = BIAS_TYPES.SHORT;
    }

    // Determine Confidence (0 - 100%)
    let agreeingSignals = 0;
    const totalSignals = 6;

    if ((bias === BIAS_TYPES.LONG && price > vwap) || (bias === BIAS_TYPES.SHORT && price < vwap)) agreeingSignals++;
    else if (bias === BIAS_TYPES.WAIT) agreeingSignals += 0.5;

    if ((bias === BIAS_TYPES.LONG && rsi >= 50) || (bias === BIAS_TYPES.SHORT && rsi <= 50)) agreeingSignals++;
    else if (bias === BIAS_TYPES.WAIT) agreeingSignals += 0.5;

    if (rvol >= 1.1) agreeingSignals++;

    if ((bias === BIAS_TYPES.LONG && changePct > 0) || (bias === BIAS_TYPES.SHORT && changePct < 0)) agreeingSignals++;

    if ((bias === BIAS_TYPES.LONG && distFromHighPct <= 2.0) || (bias === BIAS_TYPES.SHORT && distFromLowPct <= 2.0)) agreeingSignals++;
    else if (bias === BIAS_TYPES.WAIT) agreeingSignals += 0.5;

    agreeingSignals += 0.5;

    const confidencePct = Math.max(45, Math.min(96, Math.round((agreeingSignals / totalSignals) * 100)));

    return {
      ...source,
      aiScore,
      aiConfidence: confidencePct,
      bias,
      dataQuality: 'VALID',
      scoreBreakdown: {
        trend: trendScore,
        momentum: momentumScore,
        volume: volumeScore,
        volatility: volatilityScore,
        liquidity: liquidityScore,
        breakout: breakoutScore,
      },
    };
  },
};
