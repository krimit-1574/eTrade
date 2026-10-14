import requests
import yfinance as yf
import pandas as pd
import math

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
        if not all(math.isfinite(value) for value in values.values()):
            return get_yf_price(symbol)
        return {
            "symbol": str(symbol).strip().upper(),
            "price": f"{values['price']:.2f}",
            "change": f"{values['change']:.2f}",
            "pct": f"{values['pct']:.2f}",
            "high": f"{values['high']:.2f}",
            "low": f"{values['low']:.2f}",
            "vol": f"{int(values['vol']):,}",
        }
    except Exception:
        return get_yf_price(symbol)

def get_yf_price(symbol):
    try:
        sym_to_try = [symbol]
        if "." not in symbol:
            sym_to_try.extend([f"{symbol}.NS", f"{symbol}.BO"])
            
        df = pd.DataFrame()
        found_sym = symbol
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
                
        latest = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else latest
        
        price = float(latest['Close'])
        prev_close = float(prev['Close']) if len(df) > 1 else price
        high = float(latest['High'])
        low = float(latest['Low'])
        volume = float(latest.get('Volume', 0))
        if not all(math.isfinite(value) for value in (price, prev_close, high, low, volume)):
            return None
        
        change = price - prev_close
        pct = (change / prev_close) * 100 if prev_close else 0.0

        return {
            "symbol": found_sym,
            "price": f"{price:.2f}",
            "change": f"{change:.2f}",
            "pct": f"{pct:.2f}",
            "high": f"{high:.2f}",
            "low": f"{low:.2f}",
            "vol": f"{int(volume):,}"
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

    # Map 3m to 2m for yfinance compatibility.
    yf_interval = "2m" if interval == "3m" else interval

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
                return df
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
                        return df_day
                    return df.tail(40)
            except Exception:
                continue

    return pd.DataFrame()

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
