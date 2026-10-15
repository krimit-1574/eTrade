"""
AI-Powered Stock Screener
Scans NSE stocks using yfinance data + Gemini AI to produce
Top 5 Intraday Picks and Top 5 Long-Term Investment Picks.
"""

import json
import math
import re
import time
import threading
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
import numpy as np
from google import genai
from google.genai import types

# ── NSE Universe to scan ──────────────────────────────────────────
# Nifty 50 + popular mid-caps — comprehensive coverage
NSE_UNIVERSE = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "BHARTIARTL.NS", "ITC.NS", "SBIN.NS", "LT.NS", "KOTAKBANK.NS",
    "HINDUNILVR.NS", "BAJFINANCE.NS", "MARUTI.NS", "AXISBANK.NS",
    "TITAN.NS", "SUNPHARMA.NS", "TATAMOTORS.NS", "NTPC.NS",
    "ADANIENT.NS", "POWERGRID.NS", "TATASTEEL.NS", "ASIANPAINT.NS",
    "ULTRACEMCO.NS", "BAJAJFINSV.NS", "WIPRO.NS", "ONGC.NS",
    "JSWSTEEL.NS", "COALINDIA.NS", "M&M.NS", "NESTLEIND.NS",
    "HCLTECH.NS", "TECHM.NS", "GRASIM.NS", "DIVISLAB.NS",
    "DRREDDY.NS", "CIPLA.NS", "APOLLOHOSP.NS", "EICHERMOT.NS",
    "TATACONSUM.NS", "HEROMOTOCO.NS", "BPCL.NS", "INDUSINDBK.NS",
    "HINDALCO.NS", "BRITANNIA.NS", "BAJAJ-AUTO.NS",
    # Popular mid-cap / high-momentum stocks
    "ZOMATO.NS", "SUZLON.NS", "JIOFIN.NS", "TATAPOWER.NS",
    "IRFC.NS", "PNB.NS", "BANKBARODA.NS", "IOC.NS",
    "VEDL.NS", "DLF.NS", "TRENT.NS", "HAL.NS",
    "BEL.NS", "IRCTC.NS", "NHPC.NS", "PFC.NS",
    "RECLTD.NS", "CANBK.NS", "SAIL.NS", "GAIL.NS",
    "MOTHERSON.NS", "PIDILITIND.NS", "GODREJCP.NS", "DABUR.NS",
    "HAVELLS.NS", "VOLTAS.NS", "PAGEIND.NS", "LICI.NS",
    "ADANIPORTS.NS", "ADANIGREEN.NS", "ADANIPOWER.NS",
]

# ── In-memory cache ──────────────────────────────────────────────
_cache = {
    "data": None,
    "timestamp": None,
    "lock": threading.Lock(),
}

CACHE_TTL_SECONDS = 15 * 60  # 15 minutes
EXPECTED_NSE_15M_BARS = 25


def _is_cache_valid():
    if _cache["data"] is None or _cache["timestamp"] is None:
        return False
    return (time.time() - _cache["timestamp"]) < CACHE_TTL_SECONDS


# ── Intraday Technical Screener ──────────────────────────────────

def _scan_intraday_candidates():
    """
    Pull recent data for each stock and calculate a quick momentum score
    for intraday suitability.
    """
    candidates = []

    for sym in NSE_UNIVERSE:
        try:
            tk = yf.Ticker(sym)
            # Get 5-day data with 15-min intervals for intraday analysis
            df = tk.history(period="5d", interval="15m")
            if df.empty or len(df) < 20:
                continue

            # Also get daily data for volume comparison
            df_daily = tk.history(period="1mo")
            if df_daily.empty or len(df_daily) < 5:
                continue

            latest = df.iloc[-1]
            close = float(latest["Close"])
            today_date = df.index[-1].date()
            today_data = df[df.index.date == today_date]
            if today_data.empty:
                continue
            session_high = float(today_data["High"].max())
            session_low = float(today_data["Low"].min())
            today_vol = float(today_data["Volume"].sum())
            if (
                not all(math.isfinite(value) for value in (close, session_high, session_low, today_vol))
                or close <= 0 or session_high <= 0 or session_low <= 0 or today_vol < 0
            ):
                continue

            # Calculate intraday indicators
            # 1. RSI (14-period on 15-min candles)
            delta = df["Close"].diff()
            gain = delta.where(delta > 0, 0).rolling(14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
            rs = gain / loss.replace(0, np.nan)
            rsi_series = 100 - (100 / (1 + rs))
            rsi_series = rsi_series.mask((gain == 0) & (loss == 0), 50)
            rsi_series = rsi_series.mask((gain > 0) & (loss == 0), 100)
            rsi_series = rsi_series.mask((gain == 0) & (loss > 0), 0)
            rsi = float(rsi_series.iloc[-1])
            if not math.isfinite(rsi):
                rsi = 50.0

            # 2. Current-session VWAP. Mixing prior sessions produces an
            # anchored multi-day average, not an intraday VWAP.
            typical_price = (today_data["High"] + today_data["Low"] + today_data["Close"]) / 3
            session_tp_vol = float((typical_price * today_data["Volume"]).sum())
            vwap = session_tp_vol / today_vol if today_vol > 0 else close

            # 3. Relative volume versus the expected volume *so far*. Comparing
            # a partial session directly with a full-day mean understates RVOL.
            prior_daily = df_daily[df_daily.index.date < today_date]
            volume_history = prior_daily["Volume"].tail(20)
            avg_daily_vol = float(volume_history.mean()) if not volume_history.empty else 0.0
            session_progress = min(1.0, len(today_data) / EXPECTED_NSE_15M_BARS)
            expected_volume_so_far = avg_daily_vol * session_progress
            vol_ratio = today_vol / expected_volume_so_far if expected_volume_so_far > 0 else 1.0

            # 4. Price change from open today
            today_open = today_data.iloc[0]["Open"] if not today_data.empty else close
            price_change = close - today_open
            price_change_pct = (price_change / today_open) * 100 if today_open > 0 else 0

            # 5. Previous close for daily change
            prev_close = float(prior_daily.iloc[-1]["Close"]) if not prior_daily.empty else close
            daily_change = close - prev_close
            daily_change_pct = (daily_change / prev_close) * 100 if prev_close > 0 else 0

            # Calculate momentum score for intraday
            score = 0
            # RSI sweet spot (40-65 is bullish but not overbought)
            if 40 <= rsi <= 65:
                score += 25
            elif 30 <= rsi < 40:
                score += 20  # oversold bounce potential
            elif rsi > 65:
                score += 10

            # Above VWAP is bullish for intraday
            if close > vwap:
                score += 20

            # Volume surge is a strong signal
            if vol_ratio > 1.5:
                score += 25
            elif vol_ratio > 1.0:
                score += 15

            # Positive intraday movement
            if 0.5 <= price_change_pct <= 3.0:
                score += 20
            elif 0 < price_change_pct < 0.5:
                score += 10

            # Range expansion (volatility for day trading)
            day_range = ((session_high - session_low) / session_low) * 100 if session_low > 0 else 0
            if day_range > 1.5:
                score += 10

            candidates.append({
                "symbol": sym,
                "name": tk.info.get("shortName", sym.replace(".NS", "")),
                "currentPrice": round(close, 2),
                "change": round(daily_change, 2),
                "changePct": round(daily_change_pct, 2),
                "rsi": round(rsi, 1),
                "vwap": round(vwap, 2),
                "volumeRatio": round(vol_ratio, 1),
                "intradayChange": round(price_change_pct, 2),
                "score": score,
            })

        except Exception:
            continue

    # Sort by momentum score, take top 15
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:15]


# ── Long-Term Fundamental Screener ──────────────────────────────

def _scan_longterm_candidates():
    """
    Pull fundamental and price data for each stock and calculate
    a fundamental quality score for long-term investment.
    """
    candidates = []

    for sym in NSE_UNIVERSE:
        try:
            tk = yf.Ticker(sym)
            info = tk.info

            if not info or info.get("regularMarketPrice") is None:
                # Fallback: try history
                df = tk.history(period="5d")
                if df.empty:
                    continue
                close = df.iloc[-1]["Close"]
                prev = df.iloc[-2]["Close"] if len(df) > 1 else close
            else:
                close = info.get("regularMarketPrice", 0)
                prev = info.get("previousClose", close)

            daily_change = close - prev
            daily_change_pct = (daily_change / prev) * 100 if prev > 0 else 0

            # Extract fundamentals (with safe defaults)
            pe = info.get("trailingPE") or info.get("forwardPE") or 0
            pb = info.get("priceToBook") or 0
            roe = (info.get("returnOnEquity") or 0) * 100  # Convert to percentage
            de = info.get("debtToEquity") or 0
            rev_growth = (info.get("revenueGrowth") or 0) * 100
            profit_margin = (info.get("profitMargins") or 0) * 100
            dividend_yield = (info.get("dividendYield") or 0) * 100
            mkt_cap = info.get("marketCap") or 0
            eps = info.get("trailingEps") or 0
            beta = info.get("beta") or 1.0
            sector = info.get("sector", "Unknown")
            name = info.get("shortName", sym.replace(".NS", ""))

            # Calculate fundamental quality score
            score = 0

            # P/E ratio (lower is better, but not negative)
            if 0 < pe <= 15:
                score += 20
            elif 15 < pe <= 25:
                score += 15
            elif 25 < pe <= 40:
                score += 8

            # ROE (higher is better)
            if roe > 20:
                score += 20
            elif roe > 12:
                score += 15
            elif roe > 5:
                score += 8

            # Debt-to-Equity (lower is better)
            if 0 <= de < 0.5:
                score += 15
            elif de < 1.0:
                score += 10
            elif de < 1.5:
                score += 5

            # Revenue growth
            if rev_growth > 15:
                score += 15
            elif rev_growth > 8:
                score += 10
            elif rev_growth > 0:
                score += 5

            # Profit margin
            if profit_margin > 20:
                score += 15
            elif profit_margin > 10:
                score += 10
            elif profit_margin > 5:
                score += 5

            # Market cap (prefer large-cap stability)
            if mkt_cap > 1e12:  # > 1 lakh crore
                score += 10
            elif mkt_cap > 5e11:
                score += 7
            elif mkt_cap > 1e11:
                score += 5

            # Low beta is safer for long-term
            if beta < 1.0:
                score += 5

            candidates.append({
                "symbol": sym,
                "name": name,
                "currentPrice": round(close, 2),
                "change": round(daily_change, 2),
                "changePct": round(daily_change_pct, 2),
                "pe": round(pe, 1) if pe else "N/A",
                "roe": round(roe, 1) if roe else "N/A",
                "debtToEquity": round(de, 2) if de else "N/A",
                "revGrowth": f"{rev_growth:.1f}%" if rev_growth else "N/A",
                "profitMargin": f"{profit_margin:.1f}%" if profit_margin else "N/A",
                "dividendYield": f"{dividend_yield:.1f}%" if dividend_yield else "N/A",
                "marketCap": mkt_cap,
                "eps": round(eps, 2) if eps else "N/A",
                "sector": sector,
                "score": score,
            })

        except Exception:
            continue

    candidates.sort(key=lambda x: x["score"], reverse=True)
    return candidates[:15]


# ── Gemini AI Ranking ────────────────────────────────────────────

def _finite_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None


def _safe_ai_text(value, limit=600):
    return str(value or "").strip()[:limit]


def _intraday_fallback(candidate):
    price = float(candidate["currentPrice"])
    return {
        "symbol": candidate["symbol"],
        "name": candidate["name"],
        "currentPrice": price,
        "change": candidate["change"],
        "changePct": candidate["changePct"],
        "target": round(price * 1.015, 2),
        "stopLoss": round(price * 0.99, 2),
        "reason": f"Strong momentum with RSI at {candidate['rsi']}, volume {candidate['volumeRatio']}x above average.",
        "confidence": min(85, max(0, _finite_number(candidate.get("score")) or 0)),
        "riskLevel": "Medium",
        "strategy": "Enter on dip near VWAP support.",
        "technicals": {
            "rsi": candidate["rsi"],
            "vwap": candidate["vwap"],
            "volumeRatio": candidate["volumeRatio"],
        },
        "timeframe": "Intraday",
    }


def _longterm_fallback(candidate):
    price = float(candidate["currentPrice"])
    return {
        "symbol": candidate["symbol"],
        "name": candidate["name"],
        "currentPrice": price,
        "change": candidate["change"],
        "changePct": candidate["changePct"],
        "target1Y": round(price * 1.20, 2),
        "reason": f"Strong fundamentals with P/E {candidate['pe']}, ROE {candidate['roe']}%.",
        "confidence": min(80, max(0, _finite_number(candidate.get("score")) or 0)),
        "riskLevel": "Medium",
        "investmentHorizon": "1-3 Years",
        "catalysts": "Sector growth and operational efficiency improvements.",
        "fundamentals": {
            "pe": candidate["pe"],
            "roe": candidate["roe"],
            "debtToEquity": candidate["debtToEquity"],
            "revGrowth": candidate["revGrowth"],
            "profitMargin": candidate["profitMargin"],
            "dividendYield": candidate["dividendYield"],
        },
        "sector": candidate["sector"],
    }


def _validated_intraday_picks(ai_picks, candidates):
    if not isinstance(ai_picks, list):
        raise ValueError("Gemini intraday response must be a JSON array.")
    candidate_map = {str(c["symbol"]).upper(): c for c in candidates}
    result = []
    seen = set()
    for pick in ai_picks:
        if not isinstance(pick, dict):
            continue
        symbol = str(pick.get("symbol") or "").strip().upper()
        market = candidate_map.get(symbol)
        if not market or symbol in seen:
            continue
        price = _finite_number(market.get("currentPrice"))
        target = _finite_number(pick.get("target"))
        stop = _finite_number(pick.get("stopLoss"))
        confidence = _finite_number(pick.get("confidence"))
        if (
            price is None or price <= 0
            or target is None or not (price < target <= price * 1.05)
            or stop is None or not (price * 0.95 <= stop < price)
            or confidence is None or not (0 <= confidence <= 100)
        ):
            continue
        risk_level = str(pick.get("riskLevel") or "Medium").title()
        if risk_level not in {"Low", "Medium", "High"}:
            risk_level = "Medium"
        result.append({
            **_intraday_fallback(market),
            "target": round(target, 2),
            "stopLoss": round(stop, 2),
            "reason": _safe_ai_text(pick.get("reason")),
            "confidence": round(confidence, 1),
            "riskLevel": risk_level,
            "strategy": _safe_ai_text(pick.get("strategy"), 300),
        })
        seen.add(symbol)
        if len(result) == 5:
            break
    for candidate in candidates:
        symbol = str(candidate["symbol"]).upper()
        if len(result) == 5:
            break
        if symbol not in seen:
            result.append(_intraday_fallback(candidate))
            seen.add(symbol)
    return result


def _validated_longterm_picks(ai_picks, candidates):
    if not isinstance(ai_picks, list):
        raise ValueError("Gemini long-term response must be a JSON array.")
    candidate_map = {str(c["symbol"]).upper(): c for c in candidates}
    result = []
    seen = set()
    for pick in ai_picks:
        if not isinstance(pick, dict):
            continue
        symbol = str(pick.get("symbol") or "").strip().upper()
        market = candidate_map.get(symbol)
        if not market or symbol in seen:
            continue
        price = _finite_number(market.get("currentPrice"))
        target = _finite_number(pick.get("target1Y"))
        confidence = _finite_number(pick.get("confidence"))
        if (
            price is None or price <= 0
            or target is None or not (price < target <= price * 3)
            or confidence is None or not (0 <= confidence <= 100)
        ):
            continue
        risk_level = str(pick.get("riskLevel") or "Medium").title()
        if risk_level not in {"Low", "Medium", "High"}:
            risk_level = "Medium"
        result.append({
            **_longterm_fallback(market),
            "target1Y": round(target, 2),
            "reason": _safe_ai_text(pick.get("reason")),
            "confidence": round(confidence, 1),
            "riskLevel": risk_level,
            "investmentHorizon": _safe_ai_text(pick.get("investmentHorizon"), 80) or "1-3 Years",
            "catalysts": _safe_ai_text(pick.get("catalysts"), 300),
        })
        seen.add(symbol)
        if len(result) == 5:
            break
    for candidate in candidates:
        symbol = str(candidate["symbol"]).upper()
        if len(result) == 5:
            break
        if symbol not in seen:
            result.append(_longterm_fallback(candidate))
            seen.add(symbol)
    return result

def _ai_rank_intraday(candidates, api_key):
    """Use Gemini AI to rank and select top 5 intraday picks from pre-screened candidates."""
    if not candidates:
        return []

    # Build candidate summary for the AI
    candidates_text = "\n".join([
        f"- {c['symbol']}: Price ₹{c['currentPrice']}, RSI {c['rsi']}, "
        f"VWAP ₹{c['vwap']}, Volume Ratio {c['volumeRatio']}x, "
        f"Intraday Change {c['intradayChange']}%, Momentum Score {c['score']}"
        for c in candidates
    ])

    prompt = f"""You are an elite professional Indian intraday stock trader with 20+ years of experience.
Today's date: {datetime.now().strftime('%Y-%m-%d')}.

I have pre-screened these Indian NSE stocks based on momentum, RSI, VWAP, and volume analysis:

{candidates_text}

From these, select the TOP 5 BEST stocks for intraday BUY today. Consider:
1. Momentum strength and trend direction
2. RSI positioning (not overbought/oversold extremes)
3. VWAP position (above VWAP is bullish)
4. Volume surge (higher volume ratio = more conviction)
5. Risk/reward ratio

Return ONLY valid JSON array (no markdown, no backticks):
[
  {{
    "symbol": "SYMBOL.NS",
    "name": "Full Company Name",
    "target": 0.00,
    "stopLoss": 0.00,
    "reason": "2-3 sentence professional reasoning for this intraday pick",
    "confidence": 80,
    "riskLevel": "Low|Medium|High",
    "strategy": "Brief 1-sentence entry strategy"
  }}
]
Provide exactly 5 picks ordered by confidence (highest first). Target should be realistic 1-2% above current price, stopLoss 0.5-1% below."""

    try:
        if not api_key:
            raise ValueError("Gemini API Key is missing.")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="You are an elite intraday equity trader. Respond ONLY with valid JSON array. No markdown, no backticks. Be specific with real price targets.",
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )

        text = response.text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        ai_picks = json.loads(text)

        return _validated_intraday_picks(ai_picks, candidates)

    except Exception as e:
        print(f"[Screener] Intraday AI ranking error: {e}")
        # Fallback: return top 5 by score without AI analysis
        return [_intraday_fallback(candidate) for candidate in candidates[:5]]


def _ai_rank_longterm(candidates, api_key):
    """Use Gemini AI to rank and select top 5 long-term investment picks."""
    if not candidates:
        return []

    candidates_text = "\n".join([
        f"- {c['symbol']} ({c['sector']}): Price ₹{c['currentPrice']}, "
        f"P/E {c['pe']}, ROE {c['roe']}%, D/E {c['debtToEquity']}, "
        f"Rev Growth {c['revGrowth']}, Margin {c['profitMargin']}, "
        f"Div Yield {c['dividendYield']}, Score {c['score']}"
        for c in candidates
    ])

    prompt = f"""You are an elite professional Indian equity research analyst and long-term value investor with 20+ years of experience.
Today's date: {datetime.now().strftime('%Y-%m-%d')}.

I have pre-screened these Indian NSE stocks based on fundamental quality scores:

{candidates_text}

From these, select the TOP 5 BEST stocks for LONG-TERM investment (1-3 year horizon). Consider:
1. Business quality and competitive moat
2. Valuation attractiveness (P/E, P/B)
3. Return on Equity and capital efficiency
4. Revenue and profit growth trajectory
5. Balance sheet strength (low debt)
6. Sector tailwinds and macro factors
7. Management quality and corporate governance

Return ONLY valid JSON array (no markdown, no backticks):
[
  {{
    "symbol": "SYMBOL.NS",
    "name": "Full Company Name",
    "target1Y": 0.00,
    "reason": "2-3 sentence professional investment thesis",
    "confidence": 78,
    "riskLevel": "Low|Medium|High",
    "investmentHorizon": "1-3 Years",
    "catalysts": "Key upcoming growth catalysts in 1 sentence"
  }}
]
Provide exactly 5 picks ordered by confidence (highest first). target1Y should be realistic 12-month price target."""

    try:
        if not api_key:
            raise ValueError("Gemini API Key is missing.")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="You are an elite equity research analyst. Respond ONLY with valid JSON array. No markdown. Be specific with real targets and data-driven reasoning.",
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )

        text = response.text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        ai_picks = json.loads(text)

        return _validated_longterm_picks(ai_picks, candidates)

    except Exception as e:
        print(f"[Screener] Long-term AI ranking error: {e}")
        return [_longterm_fallback(candidate) for candidate in candidates[:5]]


# ── Main Entry Point ─────────────────────────────────────────────

def get_recommendations(api_key: str) -> dict:
    """
    Main function to get AI-powered stock recommendations.
    Uses caching to avoid excessive API calls.
    """
    with _cache["lock"]:
        if _is_cache_valid():
            return _cache["data"]

    # Run both screeners
    print("[Screener] Scanning intraday candidates...")
    intraday_candidates = _scan_intraday_candidates()
    print(f"[Screener] Found {len(intraday_candidates)} intraday candidates")

    print("[Screener] Scanning long-term candidates...")
    longterm_candidates = _scan_longterm_candidates()
    print(f"[Screener] Found {len(longterm_candidates)} long-term candidates")

    # AI ranking
    print("[Screener] AI ranking intraday picks...")
    intraday_picks = _ai_rank_intraday(intraday_candidates, api_key)

    print("[Screener] AI ranking long-term picks...")
    longterm_picks = _ai_rank_longterm(longterm_candidates, api_key)

    result = {
        "intraday": intraday_picks,
        "longTerm": longterm_picks,
        "generatedAt": datetime.now().isoformat(),
        "disclaimer": "These are AI-generated suggestions for educational and paper-trading purposes only. They do NOT constitute certified financial advice. Always do your own research before making real investment decisions.",
    }

    # Update cache
    with _cache["lock"]:
        _cache["data"] = result
        _cache["timestamp"] = time.time()

    print("[Screener] Recommendations generated successfully.")
    return result


def clear_cache():
    """Force clear the cache to trigger a fresh scan."""
    with _cache["lock"]:
        _cache["data"] = None
        _cache["timestamp"] = None
