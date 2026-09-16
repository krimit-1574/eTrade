import sqlite3
import json
import os
import hashlib
import binascii

DB_PATH = "eta.db"

def is_guest(user_id):
    return str(user_id) == 'guest'

def normalize_user_id(user_id):
    return str(user_id)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, settings TEXT)''')
    
    # Safely inject new columns if they do not exist
    try:
        c.execute("ALTER TABLE users ADD COLUMN email TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE users ADD COLUMN dob TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        c.execute("ALTER TABLE users ADD COLUMN virtual_cash REAL DEFAULT 1000000.0")
    except sqlite3.OperationalError:
        pass

    c.execute('''CREATE TABLE IF NOT EXISTS portfolio
                 (id INTEGER PRIMARY KEY, user_id TEXT, name TEXT, symbol TEXT, quantity REAL, buy_price REAL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS watchlist
                 (id INTEGER PRIMARY KEY, user_id TEXT, name TEXT, symbol TEXT, alert_price REAL, alert_dir TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS transactions
                 (id INTEGER PRIMARY KEY, user_id TEXT, symbol TEXT, name TEXT, order_type TEXT, quantity REAL, price REAL, total_amount REAL, timestamp TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS ai_sessions
                 (id TEXT PRIMARY KEY, user_id TEXT, symbol TEXT, start_time TEXT, end_time TEXT,
                  starting_capital REAL, ending_capital REAL, status TEXT, realized_pnl REAL,
                  trade_count INTEGER, analytics_json TEXT, trades_json TEXT, decisions_json TEXT, created_at TEXT)''')
    conn.commit()
    conn.close()

def hash_password(password):
    salt = os.urandom(16)
    pw_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return binascii.hexlify(salt + pw_hash).decode('ascii')

def check_password(password, hashed_password):
    if not hashed_password: return False
    # If it's an old plain-text password from earlier dev work
    if len(hashed_password) < 60: return password == hashed_password
    try:
        data = binascii.unhexlify(hashed_password)
        salt = data[:16]
        stored_hash = data[16:]
        pw_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
        return pw_hash == stored_hash
    except:
        return password == hashed_password

def create_user(username, password, email="", dob=""):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    if email:
        c.execute("SELECT id FROM users WHERE email = ?", (email,))
        if c.fetchone():
            conn.close()
            return None
            
    try:
        c.execute("INSERT INTO users (username, password, settings, email, dob) VALUES (?, ?, ?, ?, ?)", 
                  (username, hash_password(password), json.dumps({'av_key': '', 'gemini_key': ''}), email, dob))
        conn.commit()
        user_id = c.lastrowid
        conn.close()
        return user_id
    except sqlite3.IntegrityError:
        conn.close()
        return None

def verify_user(username, password):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Allow logging in by either username or email
    c.execute("SELECT id, password FROM users WHERE username = ? OR email = ?", (username, username))
    user = c.fetchone()
    conn.close()
    
    if user and check_password(password, user[1]):
        return user[0]
    return None

def get_settings(user_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT settings FROM users WHERE id = ?", (user_id,))
    res = c.fetchone()
    conn.close()
    return json.loads(res[0]) if res and res[0] else {}

def update_settings(user_id, settings):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE users SET settings = ? WHERE id = ?", (json.dumps(settings), user_id))
    conn.commit()
    conn.close()

def get_portfolio(user_id):
    str_uid = normalize_user_id(user_id)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, name, symbol, quantity, buy_price FROM portfolio WHERE user_id = ?", (str_uid,))
    res = [{'id': r[0], 'name': r[1], 'symbol': r[2], 'quantity': r[3], 'buy_price': r[4]} for r in c.fetchall()]
    conn.close()
    return res

def add_portfolio(user_id, name, symbol, quantity, buy_price):
    str_uid = normalize_user_id(user_id)
    qty = float(quantity)
    px = float(buy_price)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, quantity, buy_price FROM portfolio WHERE user_id = ? AND symbol = ?", (str_uid, symbol))
    existing = c.fetchone()
    if existing:
        exist_id, exist_qty, exist_px = existing
        new_qty = exist_qty + qty
        new_avg_px = round(((exist_qty * exist_px) + (qty * px)) / new_qty, 2)
        c.execute("UPDATE portfolio SET quantity = ?, buy_price = ?, name = ? WHERE id = ?",
                  (new_qty, new_avg_px, name or symbol, exist_id))
    else:
        c.execute("INSERT INTO portfolio (user_id, name, symbol, quantity, buy_price) VALUES (?, ?, ?, ?, ?)",
                  (str_uid, name or symbol, symbol, qty, px))
    conn.commit()
    conn.close()

def remove_portfolio(pid, user_id):
    str_uid = normalize_user_id(user_id)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM portfolio WHERE id = ? AND user_id = ?", (pid, str_uid))
    deleted = c.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def get_watchlist(user_id):
    str_uid = normalize_user_id(user_id)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, name, symbol, alert_price, alert_dir FROM watchlist WHERE user_id = ?", (str_uid,))
    res = [{'id': r[0], 'name': r[1], 'symbol': r[2], 'alert_price': r[3], 'alert_dir': r[4]} for r in c.fetchall()]
    conn.close()
    return res

def add_watchlist(user_id, name, symbol, alert_price, alert_dir='below'):
    str_uid = normalize_user_id(user_id)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT INTO watchlist (user_id, name, symbol, alert_price, alert_dir) VALUES (?, ?, ?, ?, ?)",
              (str_uid, name, symbol, alert_price, alert_dir))
    conn.commit()
    conn.close()

def remove_watchlist(wid, user_id):
    str_uid = normalize_user_id(user_id)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM watchlist WHERE id = ? AND user_id = ?", (wid, str_uid))
    deleted = c.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def is_in_watchlist(user_id, symbol):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id FROM watchlist WHERE user_id = ? AND symbol = ?", (str(user_id), str(symbol)))
    row = c.fetchone()
    conn.close()
    return bool(row)

def toggle_watchlist(user_id, name, symbol, alert_price=0.0, alert_dir='below'):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id FROM watchlist WHERE user_id = ? AND symbol = ?", (str(user_id), str(symbol)))
    row = c.fetchone()
    if row:
        c.execute("DELETE FROM watchlist WHERE id = ?", (row[0],))
        added = False
    else:
        clean_name = name or symbol
        c.execute("INSERT INTO watchlist (user_id, name, symbol, alert_price, alert_dir) VALUES (?, ?, ?, ?, ?)",
                  (str(user_id), clean_name, str(symbol), alert_price, alert_dir))
        added = True
    conn.commit()
    conn.close()
    return {"is_in_watchlist": added}

def get_virtual_cash(user_id, cursor=None):
    if is_guest(user_id):
        return 1000000.0
    if cursor is not None:
        cursor.execute("SELECT virtual_cash FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if row and row[0] is not None:
            return float(row[0])
        return 1000000.0
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT virtual_cash FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if row and row[0] is not None:
        return float(row[0])
    return 1000000.0

def execute_trade(user_id, symbol, name, order_type, quantity, price):
    """
    Executes a virtual BUY or SELL order atomically.
    Validates virtual cash balance and stock quantities.
    Updates portfolio average buy price and position quantity.
    """
    if is_guest(user_id):
        return {"error": "Please sign in to use paper trading."}

    try:
        qty = float(quantity)
        px = float(price)
        if qty <= 0 or px <= 0:
            return {"error": "Quantity and Price must be greater than zero."}

        str_uid = normalize_user_id(user_id)
        total_amount = round(qty * px, 2)
        order_type_upper = order_type.upper()

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("BEGIN IMMEDIATE")

        c.execute("SELECT virtual_cash FROM users WHERE id = ?", (user_id,))
        cash_row = c.fetchone()
        if not cash_row:
            conn.rollback()
            conn.close()
            return {"error": "User not found."}
        current_cash = float(cash_row[0]) if cash_row[0] is not None else 1000000.0

        if order_type_upper == 'BUY':
            if current_cash < total_amount:
                conn.rollback()
                conn.close()
                return {"error": f"Insufficient virtual cash! Required: ₹{total_amount:,.2f}, Available: ₹{current_cash:,.2f}"}

            c.execute("SELECT id, quantity, buy_price FROM portfolio WHERE user_id = ? AND symbol = ?", (str_uid, symbol))
            existing = c.fetchone()

            if existing:
                exist_id, exist_qty, exist_px = existing
                new_qty = exist_qty + qty
                new_avg_px = round(((exist_qty * exist_px) + (qty * px)) / new_qty, 2)
                c.execute("UPDATE portfolio SET quantity = ?, buy_price = ?, name = ? WHERE id = ?",
                          (new_qty, new_avg_px, name or symbol, exist_id))
            else:
                c.execute("INSERT INTO portfolio (user_id, name, symbol, quantity, buy_price) VALUES (?, ?, ?, ?, ?)",
                          (str_uid, name or symbol, symbol, qty, px))

            new_cash = round(current_cash - total_amount, 2)
            c.execute("UPDATE users SET virtual_cash = ? WHERE id = ?", (new_cash, user_id))

        elif order_type_upper == 'SELL':
            c.execute("SELECT id, quantity, buy_price FROM portfolio WHERE user_id = ? AND symbol = ?", (str_uid, symbol))
            existing = c.fetchone()

            if not existing or existing[1] < qty:
                conn.rollback()
                conn.close()
                held_qty = existing[1] if existing else 0
                return {"error": f"Cannot sell {qty} shares. You currently hold {held_qty} shares of {symbol}."}

            exist_id, exist_qty, exist_px = existing
            if exist_qty == qty:
                c.execute("DELETE FROM portfolio WHERE id = ?", (exist_id,))
            else:
                new_qty = exist_qty - qty
                c.execute("UPDATE portfolio SET quantity = ? WHERE id = ?", (new_qty, exist_id))

            new_cash = round(current_cash + total_amount, 2)
            c.execute("UPDATE users SET virtual_cash = ? WHERE id = ?", (new_cash, user_id))
        else:
            conn.rollback()
            conn.close()
            return {"error": "Invalid order type. Must be BUY or SELL."}

        from datetime import datetime
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        c.execute("INSERT INTO transactions (user_id, symbol, name, order_type, quantity, price, total_amount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                  (str_uid, symbol, name or symbol, order_type_upper, qty, px, total_amount, now_str))

        conn.commit()
        conn.close()
        return {"status": "ok", "message": f"{order_type_upper} order of {qty} shares of {symbol} executed at ₹{px:.2f}."}

    except Exception as e:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return {"error": str(e)}

def get_trading_summary(user_id):
    if is_guest(user_id):
        return {"virtual_cash": 0, "portfolio": [], "transactions": []}
    str_uid = normalize_user_id(user_id)
    cash = get_virtual_cash(user_id)
    portfolio = get_portfolio(str_uid)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, symbol, name, order_type, quantity, price, total_amount, timestamp FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20", (str_uid,))
    txs = [{'id': r[0], 'symbol': r[1], 'name': r[2], 'order_type': r[3], 'quantity': r[4], 'price': r[5], 'total_amount': r[6], 'timestamp': r[7]} for r in c.fetchall()]
    conn.close()

    return {
        "virtual_cash": cash,
        "portfolio": portfolio,
        "transactions": txs
    }

def save_ai_session(session):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''INSERT OR REPLACE INTO ai_sessions 
                 (id, user_id, symbol, start_time, end_time, starting_capital, ending_capital,
                  status, realized_pnl, trade_count, analytics_json, trades_json, decisions_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (session.get('id'), normalize_user_id(session.get('user_id', 'guest')),
               session.get('symbol', '').upper(), session.get('start_time', ''), session.get('end_time', ''),
               float(session.get('starting_capital', 100000.0)), float(session.get('ending_capital', 100000.0)),
               session.get('status', 'COMPLETED'), float(session.get('realized_pnl', 0.0)),
               int(session.get('trade_count', 0)), json.dumps(session.get('analytics', {})),
               json.dumps(session.get('trades', [])), json.dumps(session.get('decisions', [])),
               session.get('created_at', '')))
    conn.commit()
    conn.close()
    return session.get('id')

def get_ai_sessions(user_id=None, symbol=None, limit=50):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    query = "SELECT id, user_id, symbol, start_time, end_time, starting_capital, ending_capital, status, realized_pnl, trade_count, analytics_json, created_at FROM ai_sessions"
    params = []
    conditions = []
    if user_id and str(user_id) != 'guest':
        conditions.append("user_id = ?")
        params.append(normalize_user_id(user_id))
    if symbol:
        conditions.append("symbol = ?")
        params.append(symbol.upper())
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    c.execute(query, tuple(params))
    rows = c.fetchall()
    conn.close()

    sessions = []
    for r in rows:
        analytics = {}
        try:
            if r[10]: analytics = json.loads(r[10])
        except: pass
        sessions.append({
            'id': r[0],
            'user_id': r[1],
            'symbol': r[2],
            'start_time': r[3],
            'end_time': r[4],
            'starting_capital': r[5],
            'ending_capital': r[6],
            'status': r[7],
            'realized_pnl': r[8],
            'trade_count': r[9],
            'analytics': analytics,
            'created_at': r[11],
        })
    return sessions

def get_ai_session(session_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, user_id, symbol, start_time, end_time, starting_capital, ending_capital, status, realized_pnl, trade_count, analytics_json, trades_json, decisions_json, created_at FROM ai_sessions WHERE id = ?", (session_id,))
    r = c.fetchone()
    conn.close()
    if not r: return None

    try: analytics = json.loads(r[10]) if r[10] else {}
    except: analytics = {}
    try: trades = json.loads(r[11]) if r[11] else []
    except: trades = []
    try: decisions = json.loads(r[12]) if r[12] else []
    except: decisions = []

    return {
        'id': r[0],
        'user_id': r[1],
        'symbol': r[2],
        'start_time': r[3],
        'end_time': r[4],
        'starting_capital': r[5],
        'ending_capital': r[6],
        'status': r[7],
        'realized_pnl': r[8],
        'trade_count': r[9],
        'analytics': analytics,
        'trades': trades,
        'decisions': decisions,
        'created_at': r[13],
    }
