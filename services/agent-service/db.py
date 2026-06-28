import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.getenv("DB_PATH", os.path.abspath(os.path.join(os.path.dirname(__file__), "data", "lumina_trade.db")))

def get_connection():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Tracked coins table (Max 10)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tracked_coins (
            symbol TEXT PRIMARY KEY,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # Drawings table (persistent charts drawings)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS drawings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            type TEXT NOT NULL, -- 'horizontal' or 'trendline'
            data TEXT NOT NULL, -- JSON coordinates: for horizontal { price }, for trendline { start: { time, value }, end: { time, value } }
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # Screenshot notes and AI feedback table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            screenshot_path TEXT,
            user_idea TEXT,
            agent_feedback TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # Alert triggers table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            indicator TEXT NOT NULL, -- 'price', 'rsi', 'macd', 'ema55', 'ema200'
            operator TEXT NOT NULL,  -- '>', '<', 'cross_up', 'cross_down'
            value REAL NOT NULL,
            is_triggered INTEGER DEFAULT 0, -- 0 = active, 1 = triggered
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        conn.commit()
        
        # Insert default coins if none exist
        cursor.execute("SELECT COUNT(*) as count FROM tracked_coins")
        if cursor.fetchone()["count"] == 0:
            default_coins = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
            for coin in default_coins:
                cursor.execute("INSERT INTO tracked_coins (symbol) VALUES (?)", (coin,))
            conn.commit()

# --- Coins CRUD ---
def get_tracked_coins():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT symbol FROM tracked_coins ORDER BY added_at ASC")
        return [row["symbol"] for row in cursor.fetchall()]

def add_tracked_coin(symbol):
    symbol = symbol.upper().strip()
    coins = get_tracked_coins()
    if len(coins) >= 10:
        raise ValueError("Maximum of 10 tracked coins allowed.")
    if symbol in coins:
        return False
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO tracked_coins (symbol) VALUES (?)", (symbol,))
        conn.commit()
    return True

def remove_tracked_coin(symbol):
    symbol = symbol.upper().strip()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tracked_coins WHERE symbol = ?", (symbol,))
        conn.commit()
    return cursor.rowcount > 0

# --- Drawings CRUD ---
def get_drawings(symbol):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, type, data FROM drawings WHERE symbol = ?", (symbol,))
        rows = cursor.fetchall()
        return [{"id": r["id"], "type": r["type"], "data": json.loads(r["data"])} for r in rows]

def save_drawing(symbol, drawing_type, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO drawings (symbol, type, data) VALUES (?, ?, ?)",
            (symbol, drawing_type, json.dumps(data))
        )
        conn.commit()
        return cursor.lastrowid

def delete_drawing(drawing_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM drawings WHERE id = ?", (drawing_id,))
        conn.commit()
        return cursor.rowcount > 0

def clear_drawings(symbol):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM drawings WHERE symbol = ?", (symbol,))
        conn.commit()
        return cursor.rowcount > 0

# --- Notes & Analysis CRUD ---
def save_note(symbol, screenshot_path, user_idea, agent_feedback):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO notes (symbol, screenshot_path, user_idea, agent_feedback) VALUES (?, ?, ?, ?)",
            (symbol, screenshot_path, user_idea, agent_feedback)
        )
        conn.commit()
        return cursor.lastrowid

def get_notes(symbol):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM notes WHERE symbol = ? ORDER BY created_at DESC", (symbol,))
        rows = cursor.fetchall()
        return [{
            "id": r["id"],
            "symbol": r["symbol"],
            "screenshot_path": r["screenshot_path"],
            "user_idea": r["user_idea"],
            "agent_feedback": r["agent_feedback"],
            "created_at": r["created_at"]
        } for r in rows]

# --- Alerts CRUD ---
def save_alert(symbol, indicator, operator, value):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO alerts (symbol, indicator, operator, value) VALUES (?, ?, ?, ?)",
            (symbol.upper(), indicator.lower(), operator, value)
        )
        conn.commit()
        return cursor.lastrowid

def get_alerts(symbol=None, only_active=True):
    with get_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM alerts"
        params = []
        
        conditions = []
        if symbol:
            conditions.append("symbol = ?")
            params.append(symbol.upper())
        if only_active:
            conditions.append("is_triggered = 0")
            
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
            
        query += " ORDER BY created_at DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [{
            "id": r["id"],
            "symbol": r["symbol"],
            "indicator": r["indicator"],
            "operator": r["operator"],
            "value": r["value"],
            "is_triggered": r["is_triggered"],
            "created_at": r["created_at"]
        } for r in rows]

def trigger_alert(alert_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE alerts SET is_triggered = 1 WHERE id = ?", (alert_id,))
        conn.commit()
        return cursor.rowcount > 0

def delete_alert(alert_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM alerts WHERE id = ?", (alert_id,))
        conn.commit()
        return cursor.rowcount > 0
