import requests
import yfinance as yf
import pandas as pd

def fetch_price(symbol, api_key):
    if not api_key:
        return get_yf_price(symbol)
        
    url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={api_key}"
    try:
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        d = r.json()
        q = d.get("Global Quote")
        if not q or "05. price" not in q:
            # Fallback to yfinance if AlphaVantage fails or we don't hold the right quote
            return get_yf_price(symbol)
            
        return {
            "price": f"{float(q['05. price']):.2f}",
            "change": f"{float(q['09. change']):.2f}",
            "pct": f"{float(q['10. change percent'].replace('%','')):.2f}",
            "high": f"{float(q['03. high']):.2f}",
            "low": f"{float(q['04. low']):.2f}",
            "vol": f"{int(q['06. volume']):,}"
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
            tk = yf.Ticker(s)
            df = tk.history(period="5d")
            if not df.empty:
                found_sym = s
                break
                
        if df.empty:
            return None
                
        latest = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else latest
        
        price = latest['Close']
        prev_close = prev['Close'] if len(df) > 1 else price
        
        change = price - prev_close
        pct = (change / prev_close) * 100 if prev_close else 0.0

        return {
            "symbol": found_sym,
            "price": f"{price:.2f}",
            "change": f"{change:.2f}",
            "pct": f"{pct:.2f}",
            "high": f"{latest['High']:.2f}",
            "low": f"{latest['Low']:.2f}",
            "vol": f"{int(latest.get('Volume', 0)):,}"
        }
    except Exception as e:
        return None

def fetch_historical_data(symbol, period="1y", interval=None):
    """
    Fetches historical data utilizing yfinance.
    Period options: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
    Interval options: 1m, 2m, 5m, 15m, 30m, 60m, 1d
    """
    try:
        sym_list = [symbol]
        if "." not in symbol:
            sym_list.extend([f"{symbol}.NS", f"{symbol}.BO"])

        # Map 3m to 2m or 5m for yfinance compatibility if needed
        yf_interval = "2m" if interval == "3m" else interval

        kwargs = {"period": period}
        if yf_interval:
            kwargs["interval"] = yf_interval
            if yf_interval in ["1m", "2m", "5m"] and period not in ["1d", "5d", "7d"]:
                kwargs["period"] = "5d"
            elif yf_interval in ["15m", "30m"] and period in ["1y", "max"]:
                kwargs["period"] = "1mo"
        else:
            if period == "1d":
                kwargs["interval"] = "5m"
            elif period == "5d":
                kwargs["interval"] = "15m"

        for s in sym_list:
            tk = yf.Ticker(s)
            df = tk.history(**kwargs)
            if not df.empty:
                return df

        # Fallback for 1d / short interval if empty (e.g. market closed)
        if period == "1d" or (interval and interval in ["1m", "3m", "5m"]):
            for s in sym_list:
                tk = yf.Ticker(s)
                df = tk.history(period="5d", interval="15m")
                if not df.empty:
                    last_date = df.index[-1].date()
                    df_day = df[df.index.date == last_date]
                    if not df_day.empty:
                        return df_day
                    return df.tail(40)
                    
        return pd.DataFrame()
    except Exception:
        return pd.DataFrame()

def search_symbols(query: str):
    if not query or not query.strip():
        return []
    
    q_str = query.strip()
    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={requests.utils.quote(q_str)}&quotesCount=10&newsCount=0"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        res = requests.get(url, headers=headers, timeout=5)
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
