"""
AI-Powered Stock Screener
Scans NSE stocks using yfinance data + Gemini AI to produce
Top 5 Intraday Picks and Top 5 Long-Term Investment Picks.
"""

import json
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
            close = latest["Close"]
            volume = latest.get("Volume", 0)
            high = latest["High"]
            low = latest["Low"]

            # Calculate intraday indicators
            # 1. RSI (14-period on 15-min candles)
            delta = df["Close"].diff()
            gain = delta.where(delta > 0, 0).rolling(14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
            rs = gain / (loss + 1e-9)
            rsi = (100 - (100 / (1 + rs))).iloc[-1]

            # 2. VWAP approximation
            typical_price = (df["High"] + df["Low"] + df["Close"]) / 3
            cumulative_tp_vol = (typical_price * df["Volume"]).cumsum()
            cumulative_vol = df["Volume"].cumsum()
            vwap = (cumulative_tp_vol / (cumulative_vol + 1e-9)).iloc[-1]

            # 3. Volume ratio (current vs 20-day average daily volume)
            avg_daily_vol = df_daily["Volume"].rolling(20).mean().iloc[-1] if len(df_daily) >= 20 else df_daily["Volume"].mean()
            # Sum today's intraday volume
            today_date = df.index[-1].date()
            today_data = df[df.index.date == today_date]
            today_vol = today_data["Volume"].sum() if not today_data.empty else volume
            vol_ratio = today_vol / (avg_daily_vol + 1) if avg_daily_vol > 0 else 1.0

            # 4. Price change from open today
            today_open = today_data.iloc[0]["Open"] if not today_data.empty else close
            price_change = close - today_open
            price_change_pct = (price_change / today_open) * 100 if today_open > 0 else 0

            # 5. Previous close for daily change
            prev_close = df_daily.iloc[-2]["Close"] if len(df_daily) > 1 else close
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
            day_range = ((high - low) / low) * 100 if low > 0 else 0
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

        # Merge AI analysis back with real market data
        result = []
        candidate_map = {c["symbol"]: c for c in candidates}
        for pick in ai_picks[:5]:
            sym = pick["symbol"]
            market = candidate_map.get(sym, {})
            result.append({
                "symbol": sym,
                "name": pick.get("name", market.get("name", sym)),
                "currentPrice": market.get("currentPrice", 0),
                "change": market.get("change", 0),
                "changePct": market.get("changePct", 0),
                "target": pick.get("target", 0),
                "stopLoss": pick.get("stopLoss", 0),
                "reason": pick.get("reason", ""),
                "confidence": pick.get("confidence", 70),
                "riskLevel": pick.get("riskLevel", "Medium"),
                "strategy": pick.get("strategy", ""),
                "technicals": {
                    "rsi": market.get("rsi", 0),
                    "vwap": market.get("vwap", 0),
                    "volumeRatio": market.get("volumeRatio", 0),
                },
                "timeframe": "Intraday",
            })
        return result

    except Exception as e:
        print(f"[Screener] Intraday AI ranking error: {e}")
        # Fallback: return top 5 by score without AI analysis
        return [
            {
                "symbol": c["symbol"],
                "name": c["name"],
                "currentPrice": c["currentPrice"],
                "change": c["change"],
                "changePct": c["changePct"],
                "target": round(c["currentPrice"] * 1.015, 2),
                "stopLoss": round(c["currentPrice"] * 0.99, 2),
                "reason": f"Strong momentum with RSI at {c['rsi']}, volume {c['volumeRatio']}x above average.",
                "confidence": min(85, c["score"]),
                "riskLevel": "Medium",
                "strategy": "Enter on dip near VWAP support.",
                "technicals": {
                    "rsi": c["rsi"],
                    "vwap": c["vwap"],
                    "volumeRatio": c["volumeRatio"],
                },
                "timeframe": "Intraday",
            }
            for c in candidates[:5]
        ]


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

        result = []
        candidate_map = {c["symbol"]: c for c in candidates}
        for pick in ai_picks[:5]:
            sym = pick["symbol"]
            market = candidate_map.get(sym, {})
            result.append({
                "symbol": sym,
                "name": pick.get("name", market.get("name", sym)),
                "currentPrice": market.get("currentPrice", 0),
                "change": market.get("change", 0),
                "changePct": market.get("changePct", 0),
                "target1Y": pick.get("target1Y", 0),
                "reason": pick.get("reason", ""),
                "confidence": pick.get("confidence", 70),
                "riskLevel": pick.get("riskLevel", "Medium"),
                "investmentHorizon": pick.get("investmentHorizon", "1-3 Years"),
                "catalysts": pick.get("catalysts", ""),
                "fundamentals": {
                    "pe": market.get("pe", "N/A"),
                    "roe": market.get("roe", "N/A"),
                    "debtToEquity": market.get("debtToEquity", "N/A"),
                    "revGrowth": market.get("revGrowth", "N/A"),
                    "profitMargin": market.get("profitMargin", "N/A"),
                    "dividendYield": market.get("dividendYield", "N/A"),
                },
                "sector": market.get("sector", "Unknown"),
            })
        return result

    except Exception as e:
        print(f"[Screener] Long-term AI ranking error: {e}")
        return [
            {
                "symbol": c["symbol"],
                "name": c["name"],
                "currentPrice": c["currentPrice"],
                "change": c["change"],
                "changePct": c["changePct"],
                "target1Y": round(c["currentPrice"] * 1.20, 2),
                "reason": f"Strong fundamentals with P/E {c['pe']}, ROE {c['roe']}%.",
                "confidence": min(80, c["score"]),
                "riskLevel": "Medium",
                "investmentHorizon": "1-3 Years",
                "catalysts": "Sector growth and operational efficiency improvements.",
                "fundamentals": {
                    "pe": c["pe"],
                    "roe": c["roe"],
                    "debtToEquity": c["debtToEquity"],
                    "revGrowth": c["revGrowth"],
                    "profitMargin": c["profitMargin"],
                    "dividendYield": c["dividendYield"],
                },
                "sector": c["sector"],
            }
            for c in candidates[:5]
        ]


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
