import os
import uvicorn
import asyncio
import base64
from datetime import datetime
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

# Import database and client modules
import db
from llm_client import LLMClientFactory
from alert_checker import alert_checker_loop
from scheduler import init_scheduler
from telegram_bot import start_bot_async
from indicators import get_latest_indicators

# Base screenshots directory, relative to main.py to support both local and Docker environments
SCREENSHOTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "screenshots"))
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

app = FastAPI(title="Lumina Agent Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RUST_ENGINE_URL = os.getenv("RUST_ENGINE_URL", "http://engine:8000")

# --- Pydantic Schemas ---
class CoinPayload(BaseModel):
    symbol: str

class AlertPayload(BaseModel):
    symbol: str
    indicator: str
    operator: str
    value: float

class DrawingPayload(BaseModel):
    type: str # 'horizontal' | 'trendline'
    data: dict

# --- Initialize DB on startup ---
@app.on_event("startup")
async def startup_event():
    db.init_db()
    
    # Start Telegram Bot as a background task
    asyncio.create_task(start_bot_async())
    
    # Start Scheduler
    init_scheduler()
    
    # Start Alert Checker Loop
    asyncio.create_task(alert_checker_loop())

# --- REST Endpoints ---

# Tracked Coins API
@app.get("/api/agent/coins")
def get_coins():
    return {"status": "success", "coins": db.get_tracked_coins()}

@app.post("/api/agent/coins")
def add_coin(payload: CoinPayload):
    try:
        success = db.add_tracked_coin(payload.symbol)
        return {"status": "success", "added": success}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/agent/coins/{symbol}")
def remove_coin(symbol: str):
    success = db.remove_tracked_coin(symbol)
    return {"status": "success", "removed": success}

# Drawings API
@app.get("/api/agent/drawings/{symbol}")
def get_drawings(symbol: str):
    return {"status": "success", "drawings": db.get_drawings(symbol)}

@app.post("/api/agent/drawings/{symbol}")
def save_drawing(symbol: str, payload: DrawingPayload):
    drawing_id = db.save_drawing(symbol, payload.type, payload.data)
    return {"status": "success", "id": drawing_id}

@app.delete("/api/agent/drawings/{symbol}")
def clear_drawings(symbol: str):
    db.clear_drawings(symbol)
    return {"status": "success"}

@app.delete("/api/agent/drawings/item/{drawing_id}")
def delete_drawing(drawing_id: int):
    success = db.delete_drawing(drawing_id)
    return {"status": "success", "deleted": success}

# Alerts API
@app.get("/api/agent/alerts")
def get_all_alerts(symbol: str = None):
    return {"status": "success", "alerts": db.get_alerts(symbol)}

@app.post("/api/agent/alerts")
def add_alert(payload: AlertPayload):
    alert_id = db.save_alert(payload.symbol, payload.indicator, payload.operator, payload.value)
    return {"status": "success", "id": alert_id}

@app.delete("/api/agent/alerts/{alert_id}")
def delete_alert(alert_id: int):
    success = db.delete_alert(alert_id)
    return {"status": "success", "deleted": success}

# Notes and AI Analysis API
@app.get("/api/agent/notes/{symbol}")
def get_notes(symbol: str):
    return {"status": "success", "notes": db.get_notes(symbol)}

@app.post("/api/agent/notes")
async def analyze_notes(
    symbol: str = Body(...),
    image: str = Body(...), # Base64 string
    user_idea: str = Body(...),
    timeframe: str = Body("30")
):
    # 1. Parse Image Base64
    try:
        if "," in image:
            header, encoded = image.split(",", 1)
        else:
            encoded = image
        image_bytes = base64.b64decode(encoded)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")
        
    # 2. Save Image File to screenshots folder
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    screenshot_filename = f"{symbol}_{timestamp}.png"
    screenshot_path = os.path.join(SCREENSHOTS_DIR, screenshot_filename)
    
    try:
        with open(screenshot_path, "wb") as f:
            f.write(image_bytes)
    except Exception as e:
        print(f"[Error saving screenshot]: {e}")
        screenshot_path = "" # Continue even if file write fails, using relative storage fallback
        
    # 3. Fetch indicators data from Rust Engine
    indicators = {}
    candles = []
    try:
        hist_url = f"{RUST_ENGINE_URL}/api/history/{symbol}?interval={timeframe}"
        res = requests.get(hist_url, timeout=5)
        if res.status_code == 200:
            candles = res.json().get("data", [])
            indicators = get_latest_indicators(candles)
    except Exception as e:
        print(f"[Error fetching indicators for AI analysis]: {e}")

    # 4. Invoke LLM Client
    client = LLMClientFactory.get_client()
    analysis_result = await client.analyze_chart(image_bytes, user_idea, indicators)
    
    # 4.5 Auto-generate drawings from LLM if returned
    drawings = analysis_result.get("drawings", [])
    if drawings:
        db.clear_drawings(symbol)
        for d in drawings:
            d_type = d.get("type")
            if d_type == "horizontal":
                price = d.get("price")
                if price:
                    db.save_drawing(symbol, "horizontal", {"price": price})
            elif d_type == "trendline":
                start_price = d.get("start_price")
                end_price = d.get("end_price")
                start_offset = d.get("start_time_offset", -45)
                end_offset = d.get("end_time_offset", -5)
                
                if start_price and end_price and candles:
                    num_candles = len(candles)
                    start_idx = max(0, min(num_candles - 1, num_candles - 1 + start_offset))
                    end_idx = max(0, min(num_candles - 1, num_candles - 1 + end_offset))
                    
                    start_time = candles[start_idx].get("time")
                    end_time = candles[end_idx].get("time")
                    
                    if start_time and end_time:
                        trend_data = {
                            "start": {"time": start_time, "value": start_price},
                            "end": {"time": end_time, "value": end_price}
                        }
                        db.save_drawing(symbol, "trendline", trend_data)
                        
    # 5. Save Note to database
    db.save_note(
        symbol=symbol,
        screenshot_path=f"/screenshots/{screenshot_filename}" if screenshot_path else "",
        user_idea=user_idea,
        agent_feedback=analysis_result.get("strategy_feedback", "No feedback generated.")
    )
    
    return {
        "status": "success",
        "trend_analysis": analysis_result.get("trend_analysis", ""),
        "support_resistance": analysis_result.get("support_resistance", ""),
        "strategy_rating": analysis_result.get("strategy_rating", 50),
        "strategy_feedback": analysis_result.get("strategy_feedback", "")
    }

# Serving Screenshots statically
from fastapi.staticfiles import StaticFiles
app.mount("/screenshots", StaticFiles(directory=SCREENSHOTS_DIR), name="screenshots")

if __name__ == "__main__":
    port = int(os.getenv("AGENT_API_PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
