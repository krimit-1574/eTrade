"""
AI Intraday Market Scanner & Technical Scoring Engine
Calculates multi-factor intraday scores (0-100), Bias (LONG/SHORT/WAIT),
and Confidence (0-100%) using real stock market data from yfinance.
"""

import time
import math
import threading
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import yfinance as yf
import pandas as pd
import numpy as np

# ── Liquid Stock Universe (NSE India) ─────────────────────────────
UNIVERSE = [
    {"sym": "RELIANCE", "ticker": "RELIANCE.NS", "name": "Reliance Industries Ltd."},
    {"sym": "TCS", "ticker": "TCS.NS", "name": "Tata Consultancy Services"},
    {"sym": "HDFCBANK", "ticker": "HDFCBANK.NS", "name": "HDFC Bank Ltd."},
    {"sym": "INFY", "ticker": "INFY.NS", "name": "Infosys Ltd."},
    {"sym": "ICICIBANK", "ticker": "ICICIBANK.NS", "name": "ICICI Bank Ltd."},
    {"sym": "BHARTIARTL", "ticker": "BHARTIARTL.NS", "name": "Bharti Airtel Ltd."},
    {"sym": "ITC", "ticker": "ITC.NS", "name": "ITC Limited"},
    {"sym": "SBIN", "ticker": "SBIN.NS", "name": "State Bank of India"},
    {"sym": "LT", "ticker": "LT.NS", "name": "Larsen & Toubro Ltd."},
    {"sym": "KOTAKBANK", "ticker": "KOTAKBANK.NS", "name": "Kotak Mahindra Bank"},
    {"sym": "TATAMOTORS", "ticker": "TATAMOTORS.NS", "name": "Tata Motors Ltd."},
    {"sym": "AXISBANK", "ticker": "AXISBANK.NS", "name": "Axis Bank Ltd."},
    {"sym": "MARUTI", "ticker": "MARUTI.NS", "name": "Maruti Suzuki India"},
    {"sym": "SUNPHARMA", "ticker": "SUNPHARMA.NS", "name": "Sun Pharma Ltd."},
    {"sym": "NTPC", "ticker": "NTPC.NS", "name": "NTPC Limited"},
    {"sym": "BAJFINANCE", "ticker": "BAJFINANCE.NS", "name": "Bajaj Finance Ltd."},
    {"sym": "TITAN", "ticker": "TITAN.NS", "name": "Titan Company Ltd."},
    {"sym": "ADANIENT", "ticker": "ADANIENT.NS", "name": "Adani Enterprises"},
    {"sym": "POWERGRID", "ticker": "POWERGRID.NS", "name": "Power Grid Corp"},
    {"sym": "TATASTEEL", "ticker": "TATASTEEL.NS", "name": "Tata Steel Ltd."},
    {"sym": "ASIANPAINT", "ticker": "ASIANPAINT.NS", "name": "Asian Paints Ltd."},
    {"sym": "ULTRACEMCO", "ticker": "ULTRACEMCO.NS", "name": "UltraTech Cement"},
    {"sym": "WIPRO", "ticker": "WIPRO.NS", "name": "Wipro Limited"},
    {"sym": "COALINDIA", "ticker": "COALINDIA.NS", "name": "Coal India Ltd."},
    {"sym": "ZOMATO", "ticker": "ZOMATO.NS", "name": "Zomato Ltd."},
    {"sym": "SUZLON", "ticker": "SUZLON.NS", "name": "Suzlon Energy Ltd."},
    {"sym": "JIOFIN", "ticker": "JIOFIN.NS", "name": "Jio Financial Services"},
    {"sym": "TATAPOWER", "ticker": "TATAPOWER.NS", "name": "Tata Power Ltd."},
    {"sym": "IRFC", "ticker": "IRFC.NS", "name": "Indian Railway Finance"},
    {"sym": "PNB", "ticker": "PNB.NS", "name": "Punjab National Bank"},
    {"sym": "BANKBARODA", "ticker": "BANKBARODA.NS", "name": "Bank of Baroda"},
    {"sym": "VEDL", "ticker": "VEDL.NS", "name": "Vedanta Limited"},
    {"sym": "DLF", "ticker": "DLF.NS", "name": "DLF Limited"},
    {"sym": "TRENT", "ticker": "TRENT.NS", "name": "Trent Limited"},
    {"sym": "HAL", "ticker": "HAL.NS", "name": "Hindustan Aeronautics"},
    {"sym": "BEL", "ticker": "BEL.NS", "name": "Bharat Electronics Ltd."},
    {"sym": "IRCTC", "ticker": "IRCTC.NS", "name": "IRCTC Ltd."},
    {"sym": "RECLTD", "ticker": "RECLTD.NS", "name": "REC Limited"},
    {"sym": "SAIL", "ticker": "SAIL.NS", "name": "Steel Authority of India"},
    {"sym": "GAIL", "ticker": "GAIL.NS", "name": "GAIL (India) Ltd."},
]

# ── In-Memory Cache ────────────────────────────────────────────────
_scan_cache = {
    "data": None,
    "timestamp": 0,
    "lock": threading.Lock()
}
CACHE_DURATION_SEC = 180  # 3 minutes cache
EXPECTED_NSE_15M_BARS = 25

def is_nse_market_open() -> bool:
    """Check if Indian Stock Market (NSE) is currently open (09:15 - 15:30 IST, Mon-Fri)."""
    utc_now = datetime.now(timezone.utc)
    ist_now = utc_now.astimezone(timezone(timedelta(hours=5, minutes=30)))
    
    # Monday = 0, Sunday = 6
    if ist_now.weekday() in [5, 6]:
        return False
        
    market_start = ist_now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_end = ist_now.replace(hour=15, minute=30, second=0, microsecond=0)
    
    return market_start <= ist_now < market_end

def format_volume(vol_num: float) -> str:
    """Format volume numbers nicely (e.g., 8.45M, 350K)."""
    if vol_num >= 1e7:
        return f"{vol_num / 1e7:.2f}Cr"
    elif vol_num >= 1e6:
        return f"{vol_num / 1e6:.2f}M"
    elif vol_num >= 1e3:
        return f"{vol_num / 1e3:.1f}K"
    return str(int(vol_num))

def analyze_single_stock(item: dict) -> dict | None:
    """Fetches real market data and calculates technical intraday scores for a single stock."""
    ticker_str = item["ticker"]
    sym = item["sym"]
    name = item["name"]

    try:
        tk = yf.Ticker(ticker_str)
        df_15m = tk.history(period="5d", interval="15m")
        df_daily = tk.history(period="1mo")

        if df_15m.empty or len(df_15m) < 10:
            return None

        latest_candle = df_15m.iloc[-1]
        price = float(latest_candle["Close"])
        high = float(latest_candle["High"])
        low = float(latest_candle["Low"])

        # Determine latest session data
        last_date = df_15m.index[-1].date()
        df_session = df_15m[df_15m.index.date == last_date]
        if df_session.empty:
            df_session = df_15m.tail(25)

        session_open = float(df_session.iloc[0]["Open"])
        session_high = float(df_session["High"].max())
        session_low = float(df_session["Low"].min())
        session_volume = float(df_session["Volume"].sum())

        if session_volume <= 0:
            session_volume = float(latest_candle.get("Volume", 0))

        # Exclude a possibly partial current-day daily candle from both the
        # previous close and the historical volume baseline.
        prior_daily = df_daily[df_daily.index.date < last_date] if not df_daily.empty else df_daily
        prev_close = float(prior_daily.iloc[-1]["Close"]) if not prior_daily.empty else session_open

        change = price - prev_close
        change_pct = (change / prev_close * 100) if prev_close > 0 else 0.0

        # Compare partial-session volume with the expected historical volume
        # at the same point in the day, not a full-day mean.
        volume_history = prior_daily["Volume"].tail(20) if not prior_daily.empty else pd.Series(dtype=float)
        avg_vol_20d = float(volume_history.mean()) if not volume_history.empty else 0.0
        session_progress = min(1.0, len(df_session) / EXPECTED_NSE_15M_BARS)
        expected_volume_so_far = avg_vol_20d * session_progress
        rvol = round(session_volume / expected_volume_so_far, 2) if expected_volume_so_far > 0 else 1.0

        # VWAP calculation
        typical_price = (df_session["High"] + df_session["Low"] + df_session["Close"]) / 3
        cum_tp_vol = (typical_price * df_session["Volume"]).sum()
        cum_vol = df_session["Volume"].sum()
        vwap = float(cum_tp_vol / cum_vol) if cum_vol > 0 else price

        # RSI calculation (14 period on 15m)
        delta = df_15m["Close"].diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss.replace(0, np.nan)
        rsi_series = 100 - (100 / (1 + rs))
        rsi_series = rsi_series.mask((gain == 0) & (loss == 0), 50)
        rsi_series = rsi_series.mask((gain > 0) & (loss == 0), 100)
        rsi_series = rsi_series.mask((gain == 0) & (loss > 0), 0)
        rsi = float(rsi_series.iloc[-1]) if not rsi_series.empty and not pd.isna(rsi_series.iloc[-1]) else 50.0

        # ATR calculation (14 period)
        tr1 = df_15m["High"] - df_15m["Low"]
        tr2 = (df_15m["High"] - df_15m["Close"].shift(1)).abs()
        tr3 = (df_15m["Low"] - df_15m["Close"].shift(1)).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = float(tr.rolling(14).mean().iloc[-1]) if len(tr) >= 14 else float(tr.mean())

        # Moving Averages (20 & 50 period on 15m)
        sma20 = float(df_15m["Close"].rolling(20, min_periods=5).mean().iloc[-1])
        sma50 = float(df_15m["Close"].rolling(50, min_periods=10).mean().iloc[-1])

        # Distance from Day High/Low
        dist_from_high_pct = ((session_high - price) / session_high * 100) if session_high > 0 else 0
        dist_from_low_pct = ((price - session_low) / session_low * 100) if session_low > 0 else 0
        day_range_pct = ((session_high - session_low) / session_low * 100) if session_low > 0 else 0

        # ── Modular AI Scoring (0 - 100) ──────────────────────────

        # 1. Trend Score (0 - 20)
        trend_score = 0
        if price > vwap:
            trend_score += 10
        if price > sma20:
            trend_score += 6
        if sma20 > sma50:
            trend_score += 4

        # 2. Momentum Score (0 - 20)
        momentum_score = 0
        if 50 <= rsi <= 68:
            momentum_score += 12
        elif 30 <= rsi < 50:
            momentum_score += 8  # Bounce setup
        elif rsi > 68:
            momentum_score += 6  # Strong but near overbought

        intraday_change = ((price - session_open) / session_open * 100) if session_open > 0 else 0
        if intraday_change > 1.0:
            momentum_score += 8
        elif intraday_change > 0:
            momentum_score += 5

        # 3. Volume Score (0 - 20)
        volume_score = 0
        if rvol >= 2.0:
            volume_score = 20
        elif rvol >= 1.5:
            volume_score = 16
        elif rvol >= 1.2:
            volume_score = 12
        elif rvol >= 0.9:
            volume_score = 8
        else:
            volume_score = 4

        # 4. Volatility Score (0 - 15)
        volatility_score = 0
        if 1.5 <= day_range_pct <= 4.5:
            volatility_score = 15
        elif day_range_pct > 4.5:
            volatility_score = 10
        elif day_range_pct >= 0.8:
            volatility_score = 8
        else:
            volatility_score = 4

        # 5. Liquidity Score (0 - 15)
        turnover_inr = price * session_volume
        liquidity_score = 0
        if turnover_inr >= 5e8:   # > 50 Cr turnover
            liquidity_score = 15
        elif turnover_inr >= 2e8:  # > 20 Cr turnover
            liquidity_score = 12
        elif turnover_inr >= 5e7:  # > 5 Cr turnover
            liquidity_score = 8
        else:
            liquidity_score = 5

        # 6. Breakout / Position Score (0 - 10)
        breakout_score = 0
        if dist_from_high_pct <= 0.6 and rvol >= 1.2:
            breakout_score = 10  # Bullish Breakout
        elif dist_from_low_pct <= 0.6 and rvol >= 1.2:
            breakout_score = 10  # Bearish Breakdown
        elif dist_from_high_pct <= 1.5 or dist_from_low_pct <= 1.5:
            breakout_score = 6
        else:
            breakout_score = 3

        total_ai_score = int(trend_score + momentum_score + volume_score + volatility_score + liquidity_score + breakout_score)
        total_ai_score = max(10, min(99, total_ai_score))

        # ── Trend Label ───────────────────────────────────────────
        if price > vwap and price > sma20 and change_pct > 0.5:
            trend_label = "Strong Bullish"
        elif price > vwap:
            trend_label = "Bullish"
        elif price < vwap and price < sma20 and change_pct < -0.5:
            trend_label = "Strong Bearish"
        elif price < vwap:
            trend_label = "Bearish"
        else:
            trend_label = "Consolidating"

        # ── Market Bias (LONG / SHORT / WAIT) ─────────────────────
        if total_ai_score >= 62 and price > vwap and rsi >= 48 and change_pct > -0.2:
            bias = "LONG"
        elif total_ai_score >= 62 and price < vwap and rsi <= 52 and change_pct < 0.2:
            bias = "SHORT"
        else:
            bias = "WAIT"

        # ── Confidence Calculation (0 - 100%) ─────────────────────
        signals_agree = 0
        total_signals = 6

        # 1. VWAP agreement
        if (bias == "LONG" and price > vwap) or (bias == "SHORT" and price < vwap):
            signals_agree += 1
        elif bias == "WAIT":
            signals_agree += 0.5

        # 2. RSI agreement
        if (bias == "LONG" and rsi >= 50) or (bias == "SHORT" and rsi <= 50):
            signals_agree += 1
        elif bias == "WAIT":
            signals_agree += 0.5

        # 3. Moving Average agreement
        if (bias == "LONG" and price > sma20) or (bias == "SHORT" and price < sma20):
            signals_agree += 1
        elif bias == "WAIT":
            signals_agree += 0.5

        # 4. Relative Volume
        if rvol >= 1.1:
            signals_agree += 1

        # 5. Intraday price direction
        if (bias == "LONG" and change_pct > 0) or (bias == "SHORT" and change_pct < 0):
            signals_agree += 1

        # 6. Breakout proximity
        if (bias == "LONG" and dist_from_high_pct <= 2.0) or (bias == "SHORT" and dist_from_low_pct <= 2.0):
            signals_agree += 1
        elif bias == "WAIT":
            signals_agree += 0.5

        confidence_pct = int(round((signals_agree / total_signals) * 100))
        confidence_pct = max(45, min(96, confidence_pct))

        return {
            "sym": sym,
            "ticker": ticker_str,
            "name": name,
            "price": round(price, 2),
            "change": round(change, 2),
            "changePct": round(change_pct, 2),
            "high": round(session_high, 2),
            "low": round(session_low, 2),
            "open": round(session_open, 2),
            "volumeRaw": session_volume,
            "volume": format_volume(session_volume),
            "rvol": rvol,
            "vwap": round(vwap, 2),
            "atr": round(atr, 2),
            "rsi": round(rsi, 1),
            "trend": trend_label,
            "aiScore": total_ai_score,
            "aiConfidence": confidence_pct,
            "bias": bias,
            "scoreBreakdown": {
                "trend": trend_score,
                "momentum": momentum_score,
                "volume": volume_score,
                "volatility": volatility_score,
                "liquidity": liquidity_score,
                "breakout": breakout_score,
            }
        }

    except Exception as e:
        return None


def run_intraday_scanner(force_refresh: bool = False) -> dict:
    """
    Executes the full intraday market scanner across the stock universe.
    Caches results for 3 minutes.
    Returns ranked Top 10 stocks + market metadata.
    """
    now_ts = time.time()

    with _scan_cache["lock"]:
        if not force_refresh and _scan_cache["data"] is not None:
            if (now_ts - _scan_cache["timestamp"]) < CACHE_DURATION_SEC:
                return _scan_cache["data"]

    market_open = is_nse_market_open()
    results = []

    # Run stock analysis in parallel using ThreadPoolExecutor for fast execution (~1.5s)
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(analyze_single_stock, item) for item in UNIVERSE]
        for future in as_completed(futures):
            res = future.result()
            if res:
                results.append(res)

    # Sort candidates by AI Score descending
    results.sort(key=lambda x: x["aiScore"], reverse=True)

    # Pick top 10 opportunities
    top_10 = results[:10]
    for idx, item in enumerate(top_10, 1):
        item["rank"] = idx

    formatted_time = datetime.now().strftime("%I:%M:%S %p")

    payload = {
        "status": "success",
        "marketStatus": "OPEN" if market_open else "CLOSED",
        "marketStatusNote": "MARKET OPEN" if market_open else "MARKET CLOSED - Displaying latest session data",
        "lastAnalysed": formatted_time,
        "timestamp": now_ts,
        "dataSource": "Yahoo Finance (NSE Live Market Data)",
        "totalScanned": len(results),
        "opportunities": top_10
    }

    with _scan_cache["lock"]:
        _scan_cache["data"] = payload
        _scan_cache["timestamp"] = now_ts

    return payload
