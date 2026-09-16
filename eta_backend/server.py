from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import database as db
import ai_engine as ai
import market_data as md
import stock_screener as screener
import pdf_export as pdf_exp
import quant_engine as qe
import intraday_engine as intraday
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="eTA API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()

def require_registered(user_id: int | str):
    if db.is_guest(user_id):
        raise HTTPException(status_code=403, detail="Please sign in to use this feature.")

# ── Pydantic Models ───────────────────────────────────────────────

class AuthRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str = ""
    dob: str = ""

class AuthResponse(BaseModel):
    user_id: int | None = None
    username: str | None = None
    error: str | None = None

class SettingsUpdate(BaseModel):
    user_id: int | str
    av_key: str = ""
    gemini_key: str = ""

class PortfolioAdd(BaseModel):
    user_id: int | str
    name: str
    symbol: str
    quantity: float
    buy_price: float

class WatchlistAdd(BaseModel):
    user_id: int | str
    name: str
    symbol: str
    alert_price: float
    alert_dir: str = "below"

class WatchlistToggleRequest(BaseModel):
    user_id: int | str
    symbol: str
    name: str = ""

class TradeOrderRequest(BaseModel):
    user_id: int | str
    symbol: str
    name: str = ""
    order_type: str
    quantity: float
    price: float

class AnalyzeRequest(BaseModel):
    user_id: int | str
    query: str

class CompareRequest(BaseModel):
    user_id: int | str
    stock1: str
    stock2: str

# ── Auth Routes ───────────────────────────────────────────────────

@app.post("/api/auth/login")
def login(req: AuthRequest):
    uid = db.verify_user(req.username, req.password)
    if uid:
        return {"user_id": uid, "username": req.username}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    uid = db.create_user(req.username, req.password, req.email, req.dob)
    if uid:
        return {"user_id": uid, "username": req.username}
    raise HTTPException(status_code=409, detail="Username or Email already taken")

@app.post("/api/auth/guest")
def guest_login():
    return {"user_id": "guest", "username": "Guest"}

# ── Settings Routes ───────────────────────────────────────────────

@app.get("/api/settings/{user_id}")
def get_settings(user_id: int | str):
    if db.is_guest(user_id):
        return {"av_key": "", "gemini_key": ""}
    return db.get_settings(user_id)

@app.post("/api/settings")
def update_settings(req: SettingsUpdate):
    require_registered(req.user_id)
    current = db.get_settings(req.user_id)
    settings = {
        "av_key": req.av_key if req.av_key else current.get("av_key", ""),
        "gemini_key": req.gemini_key if req.gemini_key else current.get("gemini_key", "")
    }
    db.update_settings(req.user_id, settings)
    return {"status": "ok"}

# ── Portfolio Routes ──────────────────────────────────────────────

@app.get("/api/portfolio/{user_id}")
def get_portfolio(user_id: int | str):
    if db.is_guest(user_id):
        return []
    return db.get_portfolio(user_id)

@app.post("/api/portfolio")
def add_portfolio(req: PortfolioAdd):
    require_registered(req.user_id)
    db.add_portfolio(req.user_id, req.name, req.symbol, req.quantity, req.buy_price)
    return {"status": "ok"}

@app.delete("/api/portfolio/{pid}")
def remove_portfolio(pid: int, user_id: int | str):
    require_registered(user_id)
    if not db.remove_portfolio(pid, user_id):
        raise HTTPException(status_code=404, detail="Holding not found or access denied")
    return {"status": "ok"}

# ── Watchlist Routes ──────────────────────────────────────────────

@app.get("/api/watchlist/{user_id}")
def get_watchlist(user_id: int | str):
    if db.is_guest(user_id):
        return []
    return db.get_watchlist(user_id)

@app.post("/api/watchlist")
def add_watchlist(req: WatchlistAdd):
    require_registered(req.user_id)
    db.add_watchlist(req.user_id, req.name, req.symbol, req.alert_price, req.alert_dir)
    return {"status": "ok"}

@app.delete("/api/watchlist/{wid}")
def remove_watchlist(wid: int, user_id: int | str):
    require_registered(user_id)
    if not db.remove_watchlist(wid, user_id):
        raise HTTPException(status_code=404, detail="Watchlist item not found or access denied")
    return {"status": "ok"}

# ── Market Data Routes ────────────────────────────────────────────

@app.get("/api/price/{symbol}")
def get_price(symbol: str, av_key: str = ""):
    key_to_use = av_key or os.getenv("ALPHA_VANTAGE_KEY", "")
    result = md.fetch_price(symbol, key_to_use)
    if result:
        return result
    return {"price": "N/A", "change": "0", "pct": "0"}

@app.get("/api/history/{symbol}")
def get_history(symbol: str, period: str = "1y", interval: str = ""):
    df = md.fetch_historical_data(symbol, period, interval=interval if interval else None)
    if df.empty:
        return {"data": []}
    records = []
    is_intraday = period in ["1d", "5d"] or bool(interval and interval in ["1m", "3m", "5m", "15m", "30m", "60m"])
    for idx, row in df.iterrows():
        rec = {
            "date": idx.strftime("%Y-%m-%d %H:%M") if is_intraday else idx.strftime("%Y-%m-%d"),
            "open": round(row["Open"], 2),
            "high": round(row["High"], 2),
            "low": round(row["Low"], 2),
            "close": round(row["Close"], 2),
            "volume": int(row.get("Volume", 0)),
        }
        if is_intraday:
            # lightweight-charts intraday requires UNIX timestamp in seconds
            rec["time"] = int(idx.timestamp())
        else:
            rec["time"] = idx.strftime("%Y-%m-%d")
        records.append(rec)
    return {"data": records}

@app.get("/api/search")
def search_stock(q: str = ""):
    if not q:
        return {"results": []}
    return {"results": md.search_symbols(q)}

# ── AI Analysis Routes ────────────────────────────────────────────

@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    settings = db.get_settings(req.user_id) if isinstance(req.user_id, int) else {}
    api_key = settings.get("gemini_key", "") or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key is missing. Add it in Settings.")
    portfolio = db.get_portfolio(req.user_id) if isinstance(req.user_id, int) else []
    result = ai.analyze_stock(req.query, portfolio, api_key)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
        
    # Get Quantitative Analysis using resolved ticker from AI when available
    quant_symbol = result.get("symbol") or req.query
    quant_res = qe.get_quant_analysis(quant_symbol)
    if "error" not in quant_res:
        result["quantAnalysis"] = quant_res
    else:
        result["quantAnalysis"] = {"score": "N/A", "error": quant_res["error"]}
        
    return result

@app.post("/api/compare")
def compare(req: CompareRequest):
    settings = db.get_settings(req.user_id) if isinstance(req.user_id, int) else {}
    api_key = settings.get("gemini_key", "") or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key is missing.")
    portfolio = db.get_portfolio(req.user_id) if isinstance(req.user_id, int) else []
    res1 = ai.analyze_stock(req.stock1, portfolio, api_key)
    res2 = ai.analyze_stock(req.stock2, portfolio, api_key)
    if "error" in res1 or "error" in res2:
        raise HTTPException(status_code=500, detail="Error generating comparison.")
    return {"stock1": res1, "stock2": res2}

# ── PDF Export ────────────────────────────────────────────────────

@app.post("/api/export-pdf")
def export_pdf(data: dict, background_tasks: BackgroundTasks):
    path = pdf_exp.create_pdf_report(data)
    background_tasks.add_task(os.remove, path)
    return FileResponse(path, media_type="application/pdf", filename=f"{data.get('symbol', 'report')}_report.pdf")

# ── Paper Trading & Watchlist Routes ────────────────────────────────

@app.post("/api/trading/order")
def execute_trading_order(req: TradeOrderRequest):
    require_registered(req.user_id)
    res = db.execute_trade(req.user_id, req.symbol, req.name, req.order_type, req.quantity, req.price)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@app.get("/api/trading/summary/{user_id}")
def get_trading_summary(user_id: int | str):
    if db.is_guest(user_id):
        raise HTTPException(status_code=403, detail="Please sign in to use paper trading.")
    return db.get_trading_summary(user_id)

@app.get("/api/watchlist/check/{user_id}/{symbol}")
def check_watchlist(user_id: int | str, symbol: str):
    if db.is_guest(user_id):
        return {"is_in_watchlist": False}
    return {"is_in_watchlist": db.is_in_watchlist(user_id, symbol)}

@app.post("/api/watchlist/toggle")
def toggle_watchlist(req: WatchlistToggleRequest):
    require_registered(req.user_id)
    return db.toggle_watchlist(req.user_id, req.name, req.symbol)

# ── AI Stock Screener / Recommendations ──────────────────────────

@app.get("/api/screener/recommendations")
def get_recommendations(user_id: int | str = 0):
    """Get AI-powered stock recommendations (top 5 intraday + top 5 long-term)."""
    settings = db.get_settings(user_id) if isinstance(user_id, int) and user_id != 0 else {}
    api_key = settings.get("gemini_key", "") or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key is missing. Add it in Settings.")
    try:
        result = screener.get_recommendations(api_key)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Screener error: {str(e)}")

@app.post("/api/screener/refresh")
def refresh_recommendations(user_id: int | str = 0):
    """Force refresh recommendations by clearing cache."""
    settings = db.get_settings(user_id) if isinstance(user_id, int) and user_id != 0 else {}
    api_key = settings.get("gemini_key", "") or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key is missing. Add it in Settings.")
    screener.clear_cache()
    try:
        result = screener.get_recommendations(api_key)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Screener error: {str(e)}")

# ── AI Intraday Engine Endpoints ─────────────────────────────────

@app.get("/api/screener/intraday")
def get_intraday_scan(force: bool = False):
    """Runs intraday scanner and returns top 10 ranked stocks with technical scores and signals."""
    try:
        return intraday.run_intraday_scanner(force_refresh=force)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Intraday scanner error: {str(e)}")

@app.post("/api/screener/intraday/refresh")
def refresh_intraday_scan():
    """Forces refresh of intraday scanner data."""
    try:
        return intraday.run_intraday_scanner(force_refresh=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Intraday scanner refresh error: {str(e)}")

# ── AI Intraday Sessions & Journal Endpoints ──────────────────────

class AISessionPayload(BaseModel):
    id: str
    user_id: Optional[str] = "guest"
    symbol: str
    start_time: str
    end_time: Optional[str] = ""
    starting_capital: float = 100000.0
    ending_capital: float = 100000.0
    status: str = "COMPLETED"
    realized_pnl: float = 0.0
    trade_count: int = 0
    analytics: Optional[dict] = {}
    trades: Optional[list] = []
    decisions: Optional[list] = []
    created_at: Optional[str] = ""

@app.post("/api/ai-intraday/sessions")
def create_or_update_session(payload: AISessionPayload):
    """Persists completed or in-progress AI trading session."""
    try:
        session_id = db.save_ai_session(payload.dict())
        return {"status": "ok", "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save AI session: {str(e)}")

@app.get("/api/ai-intraday/sessions")
def list_ai_sessions(user_id: Optional[str] = None, symbol: Optional[str] = None, limit: int = 50):
    """Lists past AI trading sessions."""
    try:
        return db.get_ai_sessions(user_id=user_id, symbol=symbol, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get AI sessions: {str(e)}")

@app.get("/api/ai-intraday/sessions/{session_id}")
def get_ai_session_details(session_id: str):
    """Fetches complete session details with trades and decisions."""
    session = db.get_ai_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


