/**
 * SessionJournalService.js
 * 
 * Professional trade journaling, session analytics, data-driven
 * trade explanations, and post-trade retrospective analysis.
 * 
 * PAPER TRADING ONLY — All data relates to simulated trades.
 * 
 * Does NOT expose internal chain-of-thought.
 * Shows concise data-driven reasoning only.
 */

import { api } from '../../api';

// ─── Local Storage Mirror Key ────────────────────────────────────
const LOCAL_SESSIONS_KEY = 'etrade_ai_sessions';

// ─── Analytics Calculator ────────────────────────────────────────

function calculateAnalytics(trades, startingCapital, endingCapital) {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winners: 0,
      losers: 0,
      winRate: 0,
      grossProfit: 0,
      grossLoss: 0,
      netPnL: 0,
      netPnLPct: 0,
      largestWinner: 0,
      largestLoser: 0,
      avgWinner: 0,
      avgLoser: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      avgRiskReward: 0,
      avgDurationMinutes: 0,
      equityCurve: [startingCapital || 100000],
    };
  }

  let winners = 0;
  let losers = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let largestWinner = 0;
  let largestLoser = 0;
  let totalRR = 0;
  let rrCount = 0;
  let totalDurationMs = 0;
  let durationCount = 0;

  // Build equity curve for drawdown calculation
  const equityCurve = [startingCapital || 100000];
  let runningEquity = equityCurve[0];

  for (const trade of trades) {
    const pnl = parseFloat(trade.realizedPnL || trade.pnl || 0);

    if (pnl > 0) {
      winners++;
      grossProfit += pnl;
      if (pnl > largestWinner) largestWinner = pnl;
    } else if (pnl < 0) {
      losers++;
      grossLoss += Math.abs(pnl);
      if (Math.abs(pnl) > Math.abs(largestLoser)) largestLoser = pnl;
    }

    // Risk/Reward
    if (trade.riskReward && trade.riskReward > 0) {
      totalRR += trade.riskReward;
      rrCount++;
    }

    // Duration
    if (trade.entryTime && trade.exitTime) {
      const entry = new Date(trade.entryTime);
      const exit = new Date(trade.exitTime);
      const dur = exit - entry;
      if (dur > 0) {
        totalDurationMs += dur;
        durationCount++;
      }
    }

    runningEquity += pnl;
    equityCurve.push(parseFloat(runningEquity.toFixed(2)));
  }

  const totalTrades = trades.length;
  const netPnL = grossProfit - grossLoss;
  const netPnLPct = startingCapital > 0 ? (netPnL / startingCapital) * 100 : 0;
  const winRate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  const avgWinner = winners > 0 ? grossProfit / winners : 0;
  const avgLoser = losers > 0 ? grossLoss / losers : 0;
  const avgRiskReward = rrCount > 0 ? totalRR / rrCount : 0;
  const avgDurationMinutes = durationCount > 0 ? (totalDurationMs / durationCount) / 60000 : 0;

  // Maximum Drawdown (peak-to-trough)
  let peak = equityCurve[0];
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }

  return {
    totalTrades,
    winners,
    losers,
    winRate: parseFloat(winRate.toFixed(1)),
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    grossLoss: parseFloat(grossLoss.toFixed(2)),
    netPnL: parseFloat(netPnL.toFixed(2)),
    netPnLPct: parseFloat(netPnLPct.toFixed(2)),
    largestWinner: parseFloat(largestWinner.toFixed(2)),
    largestLoser: parseFloat(largestLoser.toFixed(2)),
    avgWinner: parseFloat(avgWinner.toFixed(2)),
    avgLoser: parseFloat(avgLoser.toFixed(2)),
    profitFactor: profitFactor === Infinity ? '∞' : parseFloat(profitFactor.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
    avgRiskReward: parseFloat(avgRiskReward.toFixed(2)),
    avgDurationMinutes: parseFloat(avgDurationMinutes.toFixed(1)),
    equityCurve,
  };
}

// ─── Trade Explanation Generator ──────────────────────────────────

function generateTradeExplanation(trade) {
  if (!trade) return { entry: '', stop: '', target: '' };

  const dirWord = trade.direction === 'LONG' ? 'LONG' : 'SHORT';
  const setup = (trade.setup || 'unknown_setup').replace(/_/g, ' ');

  // Why entered
  const entryParts = [`${dirWord} position: ${setup} setup detected.`];
  if (trade.entryPrice) entryParts.push(`Entry price: ₹${trade.entryPrice}.`);
  if (trade.confidence) entryParts.push(`AI confidence: ${trade.confidence}%.`);
  if (trade.rvol && trade.rvol > 1.5) entryParts.push(`Relative volume ${trade.rvol.toFixed(1)}× above average.`);
  if (trade.vwapRelation) entryParts.push(`Price was ${trade.vwapRelation} VWAP at entry.`);
  if (trade.emaTrend) entryParts.push(`EMA trend: ${trade.emaTrend}.`);
  if (trade.marketStructure) entryParts.push(`Market structure: ${trade.marketStructure}.`);
  const entryExplanation = entryParts.join(' ');

  // Why stop selected
  let stopExplanation = '';
  if (trade.stopLoss && trade.entryPrice) {
    const stopDist = Math.abs(trade.entryPrice - trade.stopLoss);
    const stopPct = ((stopDist / trade.entryPrice) * 100).toFixed(2);
    if (trade.stopReason) {
      stopExplanation = `${trade.stopReason}. Distance: ₹${stopDist.toFixed(2)} (${stopPct}%). Stop placed at ₹${trade.stopLoss}.`;
    } else {
      stopExplanation = `Stop placed at ₹${trade.stopLoss}, ₹${stopDist.toFixed(2)} (${stopPct}%) from entry based on ATR/support-resistance analysis.`;
    }
  }

  // Why target selected
  let targetExplanation = '';
  if (trade.target1 && trade.entryPrice && trade.stopLoss) {
    const reward = Math.abs(trade.target1 - trade.entryPrice);
    const risk = Math.abs(trade.entryPrice - trade.stopLoss);
    const rr = risk > 0 ? (reward / risk).toFixed(1) : '—';
    targetExplanation = `Target 1 (₹${trade.target1.toFixed(2)}) offering ${rr}:1 risk/reward.`;
    if (trade.target2) {
      const reward2 = Math.abs(trade.target2 - trade.entryPrice);
      const rr2 = risk > 0 ? (reward2 / risk).toFixed(1) : '—';
      targetExplanation += ` Target 2 (₹${trade.target2.toFixed(2)}) offering ${rr2}:1 risk/reward.`;
    }
  }

  return {
    entry: entryExplanation,
    stop: stopExplanation,
    target: targetExplanation,
  };
}

// ─── Post-Trade Retrospective ─────────────────────────────────────

function generateRetrospective(trade) {
  if (!trade) return null;

  const pnl = parseFloat(trade.realizedPnL || trade.pnl || 0);
  const isWin = pnl > 0;
  const isTargetHit = trade.exitReason?.toLowerCase().includes('target') || 
                      (trade.direction === 'LONG' && trade.target1 && trade.exitPrice >= trade.target1) ||
                      (trade.direction === 'SHORT' && trade.target1 && trade.exitPrice <= trade.target1);
  const isStopHit = trade.exitReason?.toLowerCase().includes('stop') ||
                    (trade.direction === 'LONG' && trade.stopLoss && trade.exitPrice <= trade.stopLoss) ||
                    (trade.direction === 'SHORT' && trade.stopLoss && trade.exitPrice >= trade.stopLoss);

  const whatWorked = [];
  const whatFailed = [];
  let wasEntryValid = 'Undetermined';
  let wasStopAppropriate = 'Undetermined';
  let wasExitValid = 'Undetermined';
  let strongestSignal = 'None identified';
  let failedSignal = 'None identified';
  let grade = 'B';
  let executionQuality = 'ACCEPTABLE';
  let critique = '';
  const keyTakeaways = [];

  // Stop appropriateness
  if (trade.stopLoss && trade.entryPrice) {
    const stopDist = Math.abs(trade.entryPrice - trade.stopLoss);
    const stopPct = (stopDist / trade.entryPrice) * 100;
    if (stopPct > 3) {
      wasStopAppropriate = `Wide stop (${stopPct.toFixed(1)}%) — consider tighter placement.`;
    } else if (stopPct < 0.5) {
      wasStopAppropriate = `Very tight stop (${stopPct.toFixed(1)}%) — may have been too aggressive.`;
    } else {
      wasStopAppropriate = `Reasonable stop distance (${stopPct.toFixed(1)}%).`;
    }
  }

  // Analyze outcome
  if (isWin) {
    whatWorked.push(`${(trade.setup || 'Setup').replace(/_/g, ' ')} produced a profitable trade.`);
    if (trade.confidence && trade.confidence >= 70) {
      whatWorked.push(`High AI confidence (${trade.confidence}%) correctly identified momentum.`);
      strongestSignal = `AI confidence at ${trade.confidence}%`;
    }
    if (trade.rvol && trade.rvol > 1.5) {
      whatWorked.push(`Elevated relative volume (${trade.rvol.toFixed(1)}×) confirmed institutional participation.`);
      strongestSignal = `Relative volume surge (${trade.rvol.toFixed(1)}×)`;
    }
    wasEntryValid = 'Yes — the trade reached profit targets.';
    wasExitValid = isTargetHit ? 'Yes — exited at planned target level.' : 'Acceptable — profit was captured.';

    if (isTargetHit) {
      grade = 'A+';
      executionQuality = 'EXCELLENT';
      critique = 'Trade reached profit target with disciplined execution and valid setup follow-through.';
      keyTakeaways.push('Strategy setup confirmed momentum with high reward-to-risk ratio.');
    } else {
      grade = 'A';
      executionQuality = 'EXCELLENT';
      critique = 'Profitable trade captured gains according to the trading plan.';
      keyTakeaways.push('Profitable exit executed cleanly.');
    }
  } else {
    whatFailed.push(`${(trade.setup || 'Setup').replace(/_/g, ' ')} did not follow through.`);
    if (isStopHit) {
      whatFailed.push('Price reversed to the stop-loss level.');
      failedSignal = 'Momentum reversal after entry';
      grade = 'B';
      executionQuality = 'ACCEPTABLE_LOSS';
      critique = 'Losing trade managed with disciplined risk control. Stop-loss prevented further downside.';
      keyTakeaways.push('Stop-loss protected capital from larger adverse move.');
    } else {
      failedSignal = `Weak conviction (${trade.confidence || 0}%)`;
      grade = 'C';
      executionQuality = 'NEEDS_IMPROVEMENT';
      critique = 'Loss incurred outside standard planned target or premature exit.';
      keyTakeaways.push('Re-evaluate entry timing and confirmation signals.');
    }
    wasEntryValid = pnl < 0 ? 'Questionable — price moved against the setup.' : 'Marginal.';
    wasExitValid = isStopHit ? 'Yes — stop-loss executed as planned, limiting loss.' : 'Acceptable.';
  }

  return {
    grade,
    executionQuality,
    critique,
    keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : ['Maintain risk discipline on all setups.'],
    whatWorked: whatWorked.length > 0 ? whatWorked : ['No notable strengths identified for this trade.'],
    whatFailed: whatFailed.length > 0 ? whatFailed : ['No significant failures identified.'],
    wasEntryValid,
    wasStopAppropriate,
    wasExitValid,
    strongestSignal,
    failedSignal,
    summary: isWin
      ? `Profitable trade: +₹${pnl.toFixed(2)}. The setup worked as expected.`
      : `Losing trade: -₹${Math.abs(pnl).toFixed(2)}. Review entry conditions and market context.`,
  };
}

// ─── CSV Export ───────────────────────────────────────────────────

function tradesToCSV(trades, sessionInfo = {}) {
  if (!trades || trades.length === 0) return '';

  const headers = [
    'Trade #', 'Symbol', 'Direction', 'Quantity',
    'Entry Price', 'Exit Price', 'Entry Time', 'Exit Time',
    'Initial Stop', 'Final Stop', 'Target 1', 'Target 2',
    'P&L (₹)', 'P&L (%)', 'Strategy', 'Confidence',
    'Risk/Reward', 'Entry Reason', 'Exit Reason',
  ];

  const rows = trades.map((t, i) => {
    const pnl = parseFloat(t.realizedPnL || t.pnl || 0);
    const pnlPct = t.entryPrice && t.quantity
      ? ((pnl / (t.entryPrice * t.quantity)) * 100).toFixed(2)
      : '0';
    return [
      i + 1,
      t.symbol || sessionInfo.symbol || '',
      t.direction || '',
      t.quantity || '',
      t.entryPrice || '',
      t.exitPrice || '',
      t.entryTime || '',
      t.exitTime || '',
      t.stopLoss || t.initialStop || '',
      t.finalStop || t.stopLoss || '',
      t.target1 || '',
      t.target2 || '',
      pnl.toFixed(2),
      pnlPct,
      (t.setup || '').replace(/_/g, ' '),
      t.confidence || '',
      t.riskReward || '',
      (t.entryReason || t.setup || '').replace(/_/g, ' '),
      t.exitReason || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function downloadCSV(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Session Building ─────────────────────────────────────────────

function buildSessionPayload(accountOrOptions, symbolArg, timelineEventsArg, decisionsArg, userIdArg) {
  let account = accountOrOptions;
  let symbol = symbolArg;
  let timelineEvents = timelineEventsArg;
  let decisions = decisionsArg;
  let userId = userIdArg || 'guest';

  // Support options object signature: buildSessionPayload({ account, symbol, ... })
  if (accountOrOptions && typeof accountOrOptions === 'object' && accountOrOptions.account) {
    account = accountOrOptions.account;
    symbol = accountOrOptions.symbol || symbol;
    timelineEvents = accountOrOptions.timelineEvents || timelineEvents;
    decisions = accountOrOptions.decisions || decisions;
    userId = accountOrOptions.userId || userId;
  }

  account = account || {};
  const sessionId = account.sessionId || `paper_${Date.now()}`;
  const now = new Date().toISOString();

  // Extract closed trades from account
  const trades = (account.closedPositions || []).map(pos => ({
    symbol: pos.symbol || symbol,
    direction: pos.direction,
    quantity: pos.quantity,
    entryPrice: pos.entryPrice,
    exitPrice: pos.exitPrice,
    entryTime: pos.entryTime,
    exitTime: pos.exitTime,
    stopLoss: pos.stopLoss,
    initialStop: pos.initialStop || pos.stopLoss,
    finalStop: pos.stopLoss,
    target1: pos.target1,
    target2: pos.target2,
    realizedPnL: pos.realizedPnL || 0,
    pnlPct: pos.pnlPct || 0,
    setup: pos.setup,
    confidence: pos.confidence,
    riskReward: pos.riskReward,
    entryReason: pos.setup ? pos.setup.replace(/_/g, ' ') : '',
    exitReason: pos.exitReason || '',
    partialExits: pos.partialExits || [],
  }));

  const startingCapital = account.initialCapital || 100000;
  const realizedPnL = typeof account.realizedPnL === 'number' ? account.realizedPnL : 0;
  const endingCapital = account.accountValue || (startingCapital + realizedPnL);
  const analytics = calculateAnalytics(trades, startingCapital, endingCapital);

  // Add explanations and retrospectives to each trade
  const enrichedTrades = trades.map(t => ({
    ...t,
    explanation: generateTradeExplanation(t),
    retrospective: generateRetrospective(t),
  }));

  return {
    id: sessionId,
    user_id: userId,
    symbol: (symbol || '').toUpperCase().replace('.NS', ''),
    start_time: account.createdAt || now,
    end_time: now,
    starting_capital: startingCapital,
    ending_capital: parseFloat(endingCapital.toFixed(2)),
    status: 'COMPLETED',
    realized_pnl: parseFloat(realizedPnL.toFixed(2)),
    trade_count: trades.length,
    analytics,
    trades: enrichedTrades,
    decisions: (decisions || []).slice(-100), // Keep last 100 decisions
    created_at: now,
  };
}

// ─── Local Storage Mirror ─────────────────────────────────────────

let memorySessionsFallback = [];

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

function saveSessionLocally(session) {
  try {
    const storage = getStorage();
    if (!storage) {
      const idx = memorySessionsFallback.findIndex(s => s.id === session.id);
      if (idx >= 0) memorySessionsFallback[idx] = session;
      else memorySessionsFallback.unshift(session);
      return;
    }
    const stored = storage.getItem(LOCAL_SESSIONS_KEY);
    const sessions = stored ? JSON.parse(stored) : [];
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.unshift(session);
    }
    if (sessions.length > 50) sessions.length = 50;
    storage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('SessionJournalService: Failed to mirror session to localStorage', e);
  }
}

function getLocalSessions() {
  try {
    const storage = getStorage();
    if (!storage) return memorySessionsFallback;
    const stored = storage.getItem(LOCAL_SESSIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn('SessionJournalService: Failed to read localStorage', e);
    return [];
  }
}

// ─── Main Service Export ──────────────────────────────────────────

export const SessionJournalService = {

  /**
   * Calculates comprehensive session analytics.
   */
  calculateAnalytics,

  /**
   * Generates data-driven trade entry/stop/target explanation.
   */
  generateTradeExplanation,

  /**
   * Generates structured post-trade retrospective analysis.
   */
  generateRetrospective,

  /**
   * Builds a complete session payload for persistence.
   */
  buildSessionPayload,

  /**
   * Converts trade array to CSV string.
   */
  tradesToCSV,

  /**
   * Downloads CSV file to the user's machine.
   */
  downloadCSV,

  /**
   * Persists session to backend (SQLite) and localStorage mirror.
   * Falls back gracefully to localStorage-only if backend is offline.
   */
  async saveSession(session) {
    // Always mirror locally first
    saveSessionLocally(session);

    try {
      const result = await api.saveAISession(session);
      return { saved: true, backendOk: true, result };
    } catch (err) {
      console.warn('SessionJournalService: Backend save failed, data mirrored locally', err);
      return { saved: true, backendOk: false, error: err.message };
    }
  },

  /**
   * Fetches past sessions (backend + localStorage merge).
   * Ensures data survives page refresh even if backend is down.
   */
  async getSessions(userId) {
    const localSessions = getLocalSessions();

    try {
      const backendSessions = await api.getAISessions(userId);
      // Merge: backend is source of truth, but include local-only sessions
      const backendIds = new Set((backendSessions || []).map(s => s.id));
      const localOnly = localSessions.filter(s => !backendIds.has(s.id));
      const merged = [...(backendSessions || []), ...localOnly];
      // Sort by created_at descending
      merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return merged;
    } catch (err) {
      console.warn('SessionJournalService: Backend unavailable, returning local sessions', err);
      return localSessions;
    }
  },

  /**
   * Fetches a single session detail (backend first, localStorage fallback).
   */
  async getSession(sessionId) {
    try {
      const session = await api.getAISession(sessionId);
      if (session) return session;
    } catch (err) {
      console.warn('SessionJournalService: Backend fetch failed, checking localStorage', err);
    }

    const localSessions = getLocalSessions();
    return localSessions.find(s => s.id === sessionId) || null;
  },

  /**
   * Exports session trades as downloadable CSV.
   */
  exportSessionCSV(session) {
    if (!session || !session.trades || session.trades.length === 0) return;
    const csv = tradesToCSV(session.trades, session);
    const filename = `AI_Session_${session.symbol || 'unknown'}_${(session.end_time || '').slice(0, 10)}.csv`;
    downloadCSV(csv, filename);
  },

  LOCAL_SESSIONS_KEY,
};
