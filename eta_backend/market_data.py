import requests
import yfinance as yf
import pandas as pd
import math
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
QUOTE_FRESHNESS_SECONDS = 90


def _annotate_history(df, requested_interval, effective_interval, *, is_fallback=False, reason=""):
    df.attrs.update({
        "requested_interval": requested_interval or "",
        "effective_interval": effective_interval or "",
        "is_fallback": bool(is_fallback),
        "fallback_reason": str(reason or ""),
    })
    return df


def _resample_three_minute_bars(df):
    """Build real 3-minute OHLCV bars from Yahoo's supported 1-minute data."""
    aggregations = {
        "Open": "first",
        "High": "max",
        "Low": "min",
        "Close": "last",
        "Volume": "sum",
    }
    available = {column: operation for column, operation in aggregations.items() if column in df.columns}
    if not {"Open", "High", "Low", "Close"}.issubset(available):
        return pd.DataFrame()
    result = df.resample("3min", origin="start_day", offset="9h15min").agg(available)
    return result.dropna(subset=["Open", "High", "Low", "Close"])

def fetch_price(symbol, api_key):
    if not api_key:
        return get_yf_price(symbol)
        
    try:
        r = requests.get(
            "https://www.alphavantage.co/query",
            params={"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": api_key},
            timeout=5,
        )
        r.raise_for_status()
        d = r.json()
        q = d.get("Global Quote")
        if not q or "05. price" not in q:
            # Fallback to yfinance if AlphaVantage fails or we don't hold the right quote
            return get_yf_price(symbol)
            
        values = {
            "price": float(q["05. price"]),
            "change": float(q["09. change"]),
            "pct": float(q["10. change percent"].replace("%", "")),
            "high": float(q["03. high"]),
            "low": float(q["04. low"]),
            "vol": float(q["06. volume"]),
        }
        if (
            not all(math.isfinite(value) for value in values.values())
            or values["price"] <= 0
            or values["high"] <= 0
            or values["low"] <= 0
            or values["vol"] < 0
        ):
            return get_yf_price(symbol)
        alpha_quote = {
            "symbol": str(symbol).strip().upper(),
            "price": f"{values['price']:.2f}",
            "change": f"{values['change']:.2f}",
            "pct": f"{values['pct']:.2f}",
            "high": f"{values['high']:.2f}",
            "low": f"{values['low']:.2f}",
            "vol": f"{int(values['vol']):,}",
            "as_of": str(q.get("07. latest trading day") or ""),
            "as_of_precision": "date",
            "provider": "alphavantage",
            # GLOBAL_QUOTE supplies a trading date but no timestamp. It is fine
            # for display, but cannot be certified fresh enough for execution.
            "is_delayed": True,
            "quote_age_seconds": None,
            "freshness_limit_seconds": QUOTE_FRESHNESS_SECONDS,
        }
        return get_yf_price(symbol) or alpha_quote
    except Exception:
        return get_yf_price(symbol)

def get_yf_price(symbol):
    try:
        sym_to_try = [symbol]
        if "." not in symbol:
            sym_to_try.extend([f"{symbol}.NS", f"{symbol}.BO"])
            
        df = pd.DataFrame()
        found_sym = symbol
        is_intraday = False
        for s in sym_to_try:
            try:
                tk = yf.Ticker(s)
                # Five days lets us compute change against the prior session;
                # a one-day frame only exposes the previous minute.
                df = tk.history(period="5d", interval="1m")
                if not df.empty:
                    found_sym = s
                    is_intraday = True
                    break
            except Exception:
                continue

        if df.empty:
            for s in sym_to_try:
                try:
                    tk = yf.Ticker(s)
                    df = tk.history(period="5d")
                    if not df.empty:
                        found_sym = s
                        break
                except Exception:
                    continue
                
        if df.empty:
            return None
                
        latest_date = df.index[-1].date()
        session = df[df.index.date == latest_date] if is_intraday else df.tail(1)
        if session.empty:
            return None
        latest = session.iloc[-1]

        price = float(latest['Close'])
        if is_intraday:
            prior_sessions = df[df.index.date < latest_date]
            prev_close = float(prior_sessions.iloc[-1]['Close']) if not prior_sessions.empty else price
            high = float(session['High'].max())
            low = float(session['Low'].min())
            volume = float(session['Volume'].sum())
        else:
            prev = df.iloc[-2] if len(df) > 1 else latest
            prev_close = float(prev['Close']) if len(df) > 1 else price
            high = float(latest['High'])
            low = float(latest['Low'])
            volume = float(latest.get('Volume', 0))
        if not all(math.isfinite(value) for value in (price, prev_close, high, low, volume)):
            return None
        if price <= 0 or prev_close <= 0 or high <= 0 or low <= 0 or volume < 0:
            return None
        
        change = price - prev_close
        pct = (change / prev_close) * 100 if prev_close else 0.0
        as_of_value = pd.Timestamp(df.index[-1])
        if as_of_value.tzinfo is None:
            as_of_value = as_of_value.tz_localize("UTC")
        as_of_utc = as_of_value.tz_convert("UTC")
        quote_age_seconds = (datetime.now(timezone.utc) - as_of_utc.to_pydatetime()).total_seconds()

        return {
            "symbol": found_sym,
            "price": f"{price:.2f}",
            "change": f"{change:.2f}",
            "pct": f"{pct:.2f}",
            "high": f"{high:.2f}",
            "low": f"{low:.2f}",
            "vol": f"{int(volume):,}",
            "as_of": as_of_utc.isoformat(),
            "as_of_precision": "timestamp",
            "provider": "yfinance",
            "is_delayed": (not is_intraday) or not (-30 <= quote_age_seconds <= QUOTE_FRESHNESS_SECONDS),
            "quote_age_seconds": round(quote_age_seconds, 3),
            "freshness_limit_seconds": QUOTE_FRESHNESS_SECONDS,
        }
    except Exception as e:
        return None

def fetch_historical_data(symbol, period="1y", interval=None):
    """
    Fetches historical data utilizing yfinance.
    Period options: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
    Interval options: 1m, 2m, 5m, 15m, 30m, 60m, 1d
    """
    sym_list = [symbol]
    if "." not in symbol:
        sym_list.extend([f"{symbol}.NS", f"{symbol}.BO"])

    # Yahoo has no native 3-minute interval; request 1-minute data and resample
    # it rather than silently substituting a different strategy timeframe.
    yf_interval = "1m" if interval == "3m" else interval

    kwargs = {"period": period}
    if yf_interval:
        kwargs["interval"] = yf_interval
        if yf_interval in ["1m", "2m", "5m"] and period not in ["1d", "5d", "7d"]:
            kwargs["period"] = "5d"
        elif yf_interval in ["15m", "30m"] and period in ["1y", "max"]:
            kwargs["period"] = "1mo"
    elif period == "1d":
        kwargs["interval"] = "5m"
    elif period == "5d":
        kwargs["interval"] = "15m"

    for s in sym_list:
        try:
            tk = yf.Ticker(s)
            df = tk.history(**kwargs)
            if not df.empty:
                if interval == "3m":
                    df = _resample_three_minute_bars(df)
                    if df.empty:
                        continue
                    effective_interval = "3m"
                else:
                    effective_interval = str(kwargs.get("interval") or "1d")
                return _annotate_history(df, interval, effective_interval)
        except Exception:
            continue

    # Fallback for 1d / short interval if empty (e.g. market closed)
    if period == "1d" or (interval and interval in ["1m", "3m", "5m"]):
        for s in sym_list:
            try:
                tk = yf.Ticker(s)
                df = tk.history(period="5d", interval="15m")
                if not df.empty:
                    last_date = df.index[-1].date()
                    df_day = df[df.index.date == last_date]
                    if not df_day.empty:
                        return _annotate_history(
                            df_day,
                            interval or str(kwargs.get("interval") or ""),
                            "15m",
                            is_fallback=True,
                            reason="Requested short-interval data was unavailable; latest 15-minute session returned.",
                        )
                    return _annotate_history(
                        df.tail(40),
                        interval or str(kwargs.get("interval") or ""),
                        "15m",
                        is_fallback=True,
                        reason="Requested short-interval data was unavailable; trailing 15-minute bars returned.",
                    )
            except Exception:
                continue

    return _annotate_history(pd.DataFrame(), interval, "")

def search_symbols(query: str):
    if not query or not query.strip():
        return []
    
    q_str = query.strip()
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        res = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": q_str, "quotesCount": 10, "newsCount": 0},
            headers=headers,
            timeout=5,
        )
        res.raise_for_status()
        data = res.json()
        results = []
        seen = set()
        
        for quote in data.get('quotes', []):
            sym = quote.get("symbol", "")
            if quote.get('quoteType') in ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'] and sym not in seen:
                seen.add(sym)
                name = quote.get("shortname", quote.get("longname", sym))
                exch = quote.get("exchDisp", quote.get("exchange", ""))
                results.append({
                    "symbol": sym,
                    "name": name,
                    "exchange": exch
                })
        
        # If user typed a single ticker word (e.g. ZOMATO) without suffix, check if .NS exists
        clean_q = q_str.upper().replace(".NS", "").replace(".BO", "")
        if "." not in q_str and clean_q and not any(r["symbol"].startswith(clean_q) for r in results):
            ns_sym = f"{clean_q}.NS"
            if ns_sym not in seen:
                results.insert(0, {
                    "symbol": ns_sym,
                    "name": f"{clean_q} (NSE India)",
                    "exchange": "NSE"
                })
                
        return results
    except Exception:
        # Fallback if API fails: offer .NS directly if single symbol
        clean_q = q_str.upper().replace(".NS", "").replace(".BO", "")
        if "." not in q_str and clean_q.isalpha():
            return [{
                "symbol": f"{clean_q}.NS",
                "name": f"{clean_q} (NSE India)",
                "exchange": "NSE"
            }]
        return []
