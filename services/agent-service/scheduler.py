import os
import requests
import asyncio
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from db import get_tracked_coins
from indicators import get_latest_indicators
from llm_client import LLMClientFactory
from telegram_helper import send_telegram_message

RUST_ENGINE_URL = os.getenv("RUST_ENGINE_URL", "http://engine:8000")

async def gather_market_data() -> list:
    """
    Queries history and confidence scores for all tracked coins to compile raw data for the AI.
    """
    tracked_symbols = get_tracked_coins()
    if not tracked_symbols:
        return []
        
    coins_data = []
    
    # We fetch indicators on a 1-hour interval for a daily macro perspective
    for symbol in tracked_symbols:
        try:
            # 1. Fetch score from Rust engine
            score_url = f"{RUST_ENGINE_URL}/api/widgets/score/{symbol}?interval=60"
            score_res = requests.get(score_url, timeout=5)
            score_data = score_res.json() if score_res.status_code == 200 else {}
            
            # 2. Fetch price and indicators
            hist_url = f"{RUST_ENGINE_URL}/api/history/{symbol}?interval=60"
            hist_res = requests.get(hist_url, timeout=5)
            
            latest_price = 0.0
            indicators = {}
            if hist_res.status_code == 200:
                candles = hist_res.json().get("data", [])
                if candles:
                    latest_price = candles[-1]["close"]
                    indicators = get_latest_indicators(candles)
            
            coins_data.append({
                "symbol": symbol,
                "price": latest_price,
                "confidence_score": score_data.get("score", 0),
                "status": score_data.get("status", "WATCHING"),
                "decision": score_data.get("decision", "AWAITING SIGNAL"),
                "hard_rules_met": score_data.get("hard_rules_met", False),
                "indicators": {
                    "rsi": indicators.get("rsi"),
                    "ema55": indicators.get("ema55"),
                    "ema200": indicators.get("ema200"),
                    "macd_hist": indicators.get("macd_hist"),
                    "bb_position": "above middle" if indicators.get("bb_middle") and latest_price > indicators["bb_middle"] else "below middle"
                }
            })
        except Exception as e:
            print(f"[Scheduler] Error gathering morning data for {symbol}: {e}")
            
    return coins_data

async def trigger_morning_report():
    """
    Assembles market data, invokes the active AI client, and publishes the report to Telegram.
    """
    print("[Scheduler] Running daily morning market review...")
    coins_data = await gather_market_data()
    if not coins_data:
        send_telegram_message("⚠️ Morning Report Error: No tracked coins found in database.")
        return
        
    try:
        client = LLMClientFactory.get_client()
        report = await client.generate_morning_report(coins_data)
        
        # Prepend date to report
        header = f"☀️ *DAILY MORNING TRADING REPORT* ☀️\n_Date: {datetime.now().strftime('%Y-%m-%d')}_\n\n"
        full_report = header + report
        
        # Send to Telegram
        send_telegram_message(full_report)
        print("[Scheduler] Morning report successfully published.")
    except Exception as e:
        print(f"[Scheduler] Error during morning report: {e}")
        send_telegram_message(f"⚠️ Error executing daily morning report: {e}")

def init_scheduler():
    """
    Initializes the scheduler and schedules the morning report task.
    """
    scheduler = AsyncIOScheduler()
    # Runs every day at 8:00 AM local time
    scheduler.add_job(
        trigger_morning_report,
        'cron',
        hour=8,
        minute=0,
        id='daily_morning_report'
    )
    scheduler.start()
    print("[Scheduler] Scheduled daily morning report cron job at 08:00.")
