import asyncio
import os
import requests
import traceback
from datetime import datetime
from db import get_alerts, trigger_alert
from indicators import get_latest_indicators
from telegram_helper import send_telegram_message

RUST_ENGINE_URL = os.getenv("RUST_ENGINE_URL", "http://engine:8000")
CHECK_INTERVAL_SECONDS = int(os.getenv("ALERT_CHECK_INTERVAL", "15"))

async def fetch_candles(symbol: str) -> list:
    """
    Fetches historical 5m candle data from the Rust Engine.
    """
    url = f"{RUST_ENGINE_URL}/api/history/{symbol}?interval=5"
    try:
        # Run in executor since requests is synchronous
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: requests.get(url, timeout=5)
        )
        if response.status_code == 200:
            return response.json().get("data", [])
    except Exception as e:
        print(f"[Alert Checker] Error fetching candles for {symbol}: {e}")
    return []

def check_condition(curr_val, prev_val, operator, target_val) -> bool:
    """
    Evaluates trigger conditions including price/indicator crossovers.
    """
    if curr_val is None:
        return False
        
    if operator == ">":
        return curr_val > target_val
    elif operator == "<":
        return curr_val < target_val
    elif operator == "cross_up" or operator == "cross_above":
        if prev_val is None:
            return False
        return prev_val <= target_val and curr_val > target_val
    elif operator == "cross_down" or operator == "cross_below":
        if prev_val is None:
            return False
        return prev_val >= target_val and curr_val < target_val
        
    return False

async def evaluate_alerts():
    """
    Queries active alerts and checks them against latest calculations.
    """
    active_alerts = get_alerts(only_active=True)
    if not active_alerts:
        return
        
    # Group alerts by symbol to minimize HTTP requests to Rust engine
    symbol_groups = {}
    for alert in active_alerts:
        symbol = alert["symbol"]
        if symbol not in symbol_groups:
            symbol_groups[symbol] = []
        symbol_groups[symbol].append(alert)
        
    for symbol, alerts in symbol_groups.items():
        candles = await fetch_candles(symbol)
        if len(candles) < 30:
            # Insufficient data
            continue
            
        # Calculate current indicators
        latest_ind = get_latest_indicators(candles)
        # Calculate previous indicators to verify crossovers
        prev_ind = get_latest_indicators(candles[:-1])
        
        for alert in alerts:
            ind_name = alert["indicator"].lower()
            operator = alert["operator"]
            target_val = alert["value"]
            alert_id = alert["id"]
            
            curr_val = latest_ind.get(ind_name)
            prev_val = prev_ind.get(ind_name)
            
            # Map clean indicator display names
            display_names = {
                "price": "Price",
                "rsi": "RSI (14)",
                "macd": "MACD Line",
                "macd_signal": "MACD Signal",
                "macd_hist": "MACD Hist",
                "ema55": "EMA (55)",
                "ema200": "EMA (200)",
                "bb_upper": "Bollinger Upper",
                "bb_lower": "Bollinger Lower"
            }
            ind_label = display_names.get(ind_name, ind_name.upper())
            
            if check_condition(curr_val, prev_val, operator, target_val):
                # Trigger alert!
                success = trigger_alert(alert_id)
                if success:
                    # Format alert text
                    op_symbol = {
                        ">": "crossed above" if ind_name == "price" else "went above",
                        "<": "crossed below" if ind_name == "price" else "went below",
                        "cross_up": "crossed above",
                        "cross_above": "crossed above",
                        "cross_down": "crossed below",
                        "cross_below": "crossed below"
                    }.get(operator, operator)
                    
                    msg = f"🚨 *ALERT TRIGGERED* for *{symbol}*!\n\n"
                    msg += f"• *Indicator*: {ind_label}\n"
                    msg += f"• *Condition*: {op_symbol} {target_val:,.2f}\n"
                    msg += f"• *Trigger Value*: {curr_val:,.2f}\n"
                    msg += f"• *Time*: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
                    msg += f"Action: Check chart dashboard for confirmation."
                    
                    send_telegram_message(msg)
                    print(f"[Alert Checker] Alert triggered for {symbol}: {ind_name} {operator} {target_val}")

async def alert_checker_loop():
    """
    Main loop running the alert checking thread.
    """
    print("[Alert Checker] Background loop started.")
    while True:
        try:
            await evaluate_alerts()
        except Exception as e:
            print(f"[Alert Checker Error] Exception in loop: {e}")
            traceback.print_exc()
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
