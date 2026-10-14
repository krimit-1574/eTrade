import json
import logging
import math
import os
import re
from datetime import date, datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

try:  # Support both `uvicorn server:app` and package imports in tests/tools.
    from . import ai_engine as ai
    from . import database as db
    from . import intraday_engine as intraday
    from . import market_data as md
    from . import pdf_export as pdf_exp
    from . import quant_engine as qe
    from . import stock_screener as screener
except ImportError:
    import ai_engine as ai
    import database as db
    import intraday_engine as intraday
    import market_data as md
    import pdf_export as pdf_exp
    import quant_engine as qe
    import stock_screener as screener


load_dotenv()
logger = logging.getLogger(__name__)

app = FastAPI(title="eTA API", version="3.0")

default_origins = "http://localhost:5173,http://127.0.0.1:5173"
allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", default_origins).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

db.init_db()

bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized(detail="Authentication required."):
    return HTTPException(
        status_code=401,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_auth_context(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()
    auth = db.authenticate_token(credentials.credentials)
    if not auth:
        raise _unauthorized("Session is invalid or expired. Please sign in again.")
    return {**auth, "token": credentials.credentials}


def get_current_user_id(auth=Depends(get_auth_context)):
    return auth["user_id"]


def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    if credentials is None:
        return None
    if credentials.scheme.lower() != "bearer":
        raise _unauthorized()
    auth = db.authenticate_token(credentials.credentials)
    if not auth:
        raise _unauthorized("Session is invalid or expired. Please sign in again.")
    return auth["user_id"]


def _auth_response(user_id, username):
    token, expires_at = db.create_auth_session(user_id)
    return {
        "user_id": user_id,
        "username": username,
        "access_token": token,
        "token_type": "bearer",
        "expires_at": datetime.fromtimestamp(expires_at, timezone.utc).isoformat(),
    }


def _clean_symbol(symbol):
    if not isinstance(symbol, str):
        raise HTTPException(status_code=422, detail="Symbol must be a string.")
    cleaned = symbol.strip().upper()
    if not cleaned or len(cleaned) > 64 or any(ord(ch) < 32 for ch in cleaned):
        raise HTTPException(status_code=422, detail="Invalid symbol.")
    return cleaned


def _mask_secret(value):
    if not value:
        return ""
    return f"...{value[-4:]}" if len(value) > 4 else "saved"


class AuthRequest(BaseModel):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=1024)
    email: str = Field(default="", max_length=254)
    dob: str = Field(default="", max_length=10)


class SettingsUpdate(BaseModel):
    av_key: Optional[str] = Field(default=None, max_length=1024)
    gemini_key: Optional[str] = Field(default=None, max_length=1024)
    clear_av_key: bool = False
    clear_gemini_key: bool = False


class PortfolioAdd(BaseModel):
    name: str = Field(default="", max_length=200)
    symbol: str = Field(min_length=1, max_length=64)
    quantity: float = Field(gt=0, allow_inf_nan=False)
    buy_price: float = Field(gt=0, allow_inf_nan=False)


class WatchlistAdd(BaseModel):
    name: str = Field(default="", max_length=200)
    symbol: str = Field(min_length=1, max_length=64)
    alert_price: float = Field(default=0, ge=0, allow_inf_nan=False)
    alert_dir: str = Field(default="below", max_length=10)


class WatchlistToggleRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=64)
    name: str = Field(default="", max_length=200)


class TradeOrderRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=64)
    name: str = Field(default="", max_length=200)
    order_type: str = Field(min_length=3, max_length=4)
    quantity: float = Field(gt=0, allow_inf_nan=False)
    price: float = Field(gt=0, allow_inf_nan=False)


class AnalyzeRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)


class CompareRequest(BaseModel):
    stock1: str = Field(min_length=1, max_length=200)
    stock2: str = Field(min_length=1, max_length=200)


class AISessionPayload(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    symbol: str = Field(min_length=1, max_length=64)
    start_time: str = Field(min_length=1, max_length=64)
    end_time: str = Field(default="", max_length=64)
    starting_capital: float = Field(default=100000.0, ge=0, allow_inf_nan=False)
    ending_capital: float = Field(default=100000.0, ge=0, allow_inf_nan=False)
    status: str = Field(default="COMPLETED", min_length=1, max_length=40)
    realized_pnl: float = Field(default=0.0, allow_inf_nan=False)
    trade_count: int = Field(default=0, ge=0)
    analytics: dict = Field(default_factory=dict)
    trades: list = Field(default_factory=list)
    decisions: list = Field(default_factory=list)
    created_at: str = Field(default="", max_length=64)


# Authentication

@app.post("/api/auth/login")
def login(req: AuthRequest):
    identifier = req.username.strip()
    uid = db.verify_user(identifier, req.password)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user = db.get_user(uid)
    return _auth_response(uid, user["username"])


@app.post("/api/auth/register")
def register(req: RegisterRequest):
    username = req.username.strip()
    email = req.email.strip().lower()
    if not username:
        raise HTTPException(status_code=422, detail="Username is required.")
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if req.dob:
        try:
            born = date.fromisoformat(req.dob)
            today = date.today()
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
        except ValueError:
            raise HTTPException(status_code=422, detail="Date of birth must use YYYY-MM-DD.")
        if age < 18:
            raise HTTPException(status_code=422, detail="You must be at least 18 years old.")
    uid = db.create_user(username, req.password, email, req.dob)
    if not uid:
        raise HTTPException(status_code=409, detail="Username or email is already taken")
    return _auth_response(uid, username)


@app.post("/api/auth/guest")
def guest_login():
    return {"user_id": "guest", "username": "Guest"}


@app.get("/api/auth/me")
def auth_me(auth=Depends(get_auth_context)):
    user = db.get_user(auth["user_id"])
    if not user:
        raise _unauthorized()
    return user


@app.post("/api/auth/logout")
def logout(auth=Depends(get_auth_context)):
    db.revoke_auth_session(auth["token"])
    return {"status": "ok"}


# Settings

@app.get("/api/settings")
def get_settings(user_id=Depends(get_current_user_id)):
    settings = db.get_settings(user_id)
    av_key = str(settings.get("av_key") or "")
    gemini_key = str(settings.get("gemini_key") or "")
    return {
        "has_av_key": bool(av_key),
        "has_gemini_key": bool(gemini_key),
        "av_key_hint": _mask_secret(av_key),
        "gemini_key_hint": _mask_secret(gemini_key),
    }


@app.post("/api/settings")
def update_settings(req: SettingsUpdate, user_id=Depends(get_current_user_id)):
    current = db.get_settings(user_id)
    if req.clear_av_key:
        current["av_key"] = ""
    elif req.av_key is not None and req.av_key.strip():
        current["av_key"] = req.av_key.strip()
    if req.clear_gemini_key:
        current["gemini_key"] = ""
    elif req.gemini_key is not None and req.gemini_key.strip():
        current["gemini_key"] = req.gemini_key.strip()
    if not db.update_settings(user_id, current):
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "ok"}


# Portfolio and watchlist

@app.get("/api/portfolio")
def get_portfolio(user_id=Depends(get_current_user_id)):
    return db.get_portfolio(user_id)


@app.post("/api/portfolio")
def add_portfolio(req: PortfolioAdd, user_id=Depends(get_current_user_id)):
    try:
        db.add_portfolio(user_id, req.name, req.symbol, req.quantity, req.buy_price)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"status": "ok"}


@app.delete("/api/portfolio/{pid}")
def remove_portfolio(pid: int, user_id=Depends(get_current_user_id)):
    if not db.remove_portfolio(pid, user_id):
        raise HTTPException(status_code=404, detail="Holding not found")
    return {"status": "ok"}


@app.get("/api/watchlist")
def get_watchlist(user_id=Depends(get_current_user_id)):
    return db.get_watchlist(user_id)


@app.post("/api/watchlist")
def add_watchlist(req: WatchlistAdd, user_id=Depends(get_current_user_id)):
    try:
        db.add_watchlist(user_id, req.name, req.symbol, req.alert_price, req.alert_dir)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"status": "ok"}


@app.delete("/api/watchlist/{wid}")
def remove_watchlist(wid: int, user_id=Depends(get_current_user_id)):
    if not db.remove_watchlist(wid, user_id):
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    return {"status": "ok"}


@app.get("/api/watchlist/check/{symbol}")
def check_watchlist(symbol: str, user_id=Depends(get_current_user_id)):
    try:
        return {"is_in_watchlist": db.is_in_watchlist(user_id, symbol)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.post("/api/watchlist/toggle")
def toggle_watchlist(req: WatchlistToggleRequest, user_id=Depends(get_current_user_id)):
    try:
        return db.toggle_watchlist(user_id, req.name, req.symbol)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# Market data (intentionally public; a valid session may supply its saved AV key)

@app.get("/api/price/{symbol}")
def get_price(symbol: str, user_id=Depends(get_optional_user_id)):
    symbol = _clean_symbol(symbol)
    settings = db.get_settings(user_id) if user_id is not None else {}
    key_to_use = settings.get("av_key", "") or os.getenv("ALPHA_VANTAGE_KEY", "")
    result = md.fetch_price(symbol, key_to_use)
    return result or {"symbol": symbol, "price": "N/A", "change": "0", "pct": "0"}


@app.get("/api/history/{symbol}")
def get_history(
    symbol: str,
    period: str = Query(default="1y"),
    interval: str = Query(default=""),
):
    symbol = _clean_symbol(symbol)
    allowed_periods = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd"}
    allowed_intervals = {"", "1m", "2m", "3m", "5m", "15m", "30m", "60m", "1d"}
    if period not in allowed_periods or interval not in allowed_intervals:
        raise HTTPException(status_code=422, detail="Unsupported history period or interval.")
    df = md.fetch_historical_data(symbol, period, interval=interval or None)
    if df.empty:
        return {"data": []}
    records = []
    is_intraday = period in {"1d", "5d"} or interval in {"1m", "2m", "3m", "5m", "15m", "30m", "60m"}
    for idx, row in df.iterrows():
        values = [float(row[column]) for column in ("Open", "High", "Low", "Close")]
        if not all(math.isfinite(value) for value in values):
            continue
        rec = {
            "date": idx.strftime("%Y-%m-%d %H:%M") if is_intraday else idx.strftime("%Y-%m-%d"),
            "open": round(values[0], 2),
            "high": round(values[1], 2),
            "low": round(values[2], 2),
            "close": round(values[3], 2),
            "volume": int(row.get("Volume", 0)) if math.isfinite(float(row.get("Volume", 0))) else 0,
        }
        rec["time"] = int(idx.timestamp()) if is_intraday else idx.strftime("%Y-%m-%d")
        records.append(rec)
    return {"data": records}


@app.get("/api/search")
def search_stock(q: str = Query(default="", max_length=100)):
    query = q.strip()
    return {"results": md.search_symbols(query)} if query else {"results": []}


# AI analysis (authenticated to prevent use of server/user API keys by strangers)

@app.post("/api/analyze")
def analyze(req: AnalyzeRequest, user_id=Depends(get_current_user_id)):
    settings = db.get_settings(user_id)
    api_key = settings.get("gemini_key", "") or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key is missing. Add it in Settings.")
    result = ai.analyze_stock(req.query.strip(), db.get_portfolio(user_id), api_key)
    if "error" in result:
        logger.warning("AI analysis failed: %s", result["error"])
        raise HTTPException(status_code=502, detail="AI analysis could not be completed.")
    quant_res = qe.get_quant_analysis(result.get("symbol") or req.query)
    result["quantAnalysis"] = (
        quant_res if "error" not in quant_res else {"score": "N/A", "error": "Quantitative analysis unavailable."}
    )
    return result


@app.post("/api/compare")
def compare(req: CompareRequest, user_id=Depends(get_current_user_id)):
    settings = db.get_settings(user_id)
    api_key = settings.get("gemini_key", "") or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key is missing.")
    portfolio = db.get_portfolio(user_id)
    res1 = ai.analyze_stock(req.stock1.strip(), portfolio, api_key)
    res2 = ai.analyze_stock(req.stock2.strip(), portfolio, api_key)
    if "error" in res1 or "error" in res2:
        raise HTTPException(status_code=502, detail="AI comparison could not be completed.")
    return {"stock1": res1, "stock2": res2}


@app.post("/api/export-pdf")
def export_pdf(data: dict, background_tasks: BackgroundTasks, _user_id=Depends(get_current_user_id)):
    if len(json.dumps(data, default=str)) > 1_000_000:
        raise HTTPException(status_code=413, detail="Report payload is too large.")
    try:
        path = pdf_exp.create_pdf_report(data)
    except Exception:
        logger.exception("PDF generation failed")
        raise HTTPException(status_code=422, detail="PDF report could not be generated from this data.")
    background_tasks.add_task(os.remove, path)
    filename_symbol = re.sub(r"[^A-Za-z0-9._-]", "_", str(data.get("symbol") or "report"))[:64]
    return FileResponse(path, media_type="application/pdf", filename=f"{filename_symbol}_report.pdf")


# Paper trading

@app.post("/api/trading/order")
def execute_trading_order(req: TradeOrderRequest, user_id=Depends(get_current_user_id)):
    requested_symbol = _clean_symbol(req.symbol)
    settings = db.get_settings(user_id)
    api_key = settings.get("av_key", "") or os.getenv("ALPHA_VANTAGE_KEY", "")
    quote = md.fetch_price(requested_symbol, api_key)
    try:
        execution_price = float(quote["price"])
    except (KeyError, TypeError, ValueError, OverflowError):
        raise HTTPException(status_code=503, detail="A verified market price is unavailable for this order.")
    if not math.isfinite(execution_price) or execution_price <= 0:
        raise HTTPException(status_code=503, detail="A verified market price is unavailable for this order.")
    execution_symbol = quote.get("symbol") or requested_symbol
    res = db.execute_trade(
        user_id,
        execution_symbol,
        req.name,
        req.order_type,
        req.quantity,
        execution_price,
    )
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@app.get("/api/trading/summary")
def get_trading_summary(user_id=Depends(get_current_user_id)):
    return db.get_trading_summary(user_id)


# Screeners

@app.get("/api/screener/recommendations")
def get_recommendations(user_id=Depends(get_current_user_id)):
    settings = db.get_settings(user_id)
    api_key = settings.get("gemini_key", "") or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key is missing. Add it in Settings.")
    try:
        return screener.get_recommendations(api_key)
    except Exception:
        logger.exception("Recommendation screener failed")
        raise HTTPException(status_code=502, detail="Screener is temporarily unavailable.")


@app.post("/api/screener/refresh")
def refresh_recommendations(user_id=Depends(get_current_user_id)):
    settings = db.get_settings(user_id)
    api_key = settings.get("gemini_key", "") or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key is missing. Add it in Settings.")
    screener.clear_cache()
    try:
        return screener.get_recommendations(api_key)
    except Exception:
        logger.exception("Recommendation screener refresh failed")
        raise HTTPException(status_code=502, detail="Screener is temporarily unavailable.")


@app.get("/api/screener/intraday")
def get_intraday_scan():
    try:
        return intraday.run_intraday_scanner(force_refresh=False)
    except Exception:
        logger.exception("Intraday scanner failed")
        raise HTTPException(status_code=502, detail="Intraday scanner is temporarily unavailable.")


@app.post("/api/screener/intraday/refresh")
def refresh_intraday_scan(_user_id=Depends(get_current_user_id)):
    try:
        return intraday.run_intraday_scanner(force_refresh=True)
    except Exception:
        logger.exception("Intraday scanner refresh failed")
        raise HTTPException(status_code=502, detail="Intraday scanner is temporarily unavailable.")


# AI intraday sessions and journal

@app.post("/api/ai-intraday/sessions")
def create_or_update_session(payload: AISessionPayload, user_id=Depends(get_current_user_id)):
    try:
        session_id = db.save_ai_session(payload.model_dump(), user_id)
        return {"status": "ok", "session_id": session_id}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Session belongs to another user.")
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Failed to save AI session")
        raise HTTPException(status_code=500, detail="Failed to save AI session.")


@app.get("/api/ai-intraday/sessions")
def list_ai_sessions(
    symbol: Optional[str] = Query(default=None, max_length=64),
    limit: int = Query(default=50, ge=1, le=100),
    user_id=Depends(get_current_user_id),
):
    try:
        return db.get_ai_sessions(user_id=user_id, symbol=symbol, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.get("/api/ai-intraday/sessions/{session_id}")
def get_ai_session_details(
    session_id: str,
    user_id=Depends(get_current_user_id),
):
    session = db.get_ai_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
