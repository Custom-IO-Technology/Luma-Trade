import json
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from typing import List
from .schemas import ScoreResponse, HistoryResponse
from data_connectors.redis_client import RedisClient
from data_connectors.questdb_client import QuestDBClient
from core.config import settings

router = APIRouter()

# Dependency for RedisClient
def get_redis() -> RedisClient:
    return RedisClient(settings.redis_url)

# Dependency for QuestDBClient
def get_questdb() -> QuestDBClient:
    return QuestDBClient(settings.questdb_http_url)

@router.get("/widgets/score/{symbol}", response_model=ScoreResponse)
async def get_score(symbol: str, redis: RedisClient = Depends(get_redis)):
    """Get the latest confidence score for a symbol."""
    key = f"{settings.redis_state_prefix}:{symbol}:score"
    val = await redis.client.get(key)
    if not val:
        raise HTTPException(status_code=404, detail="Score not found")
        
    data = json.loads(val)
    data["symbol"] = symbol
    return data

@router.get("/history/{symbol}", response_model=HistoryResponse)
async def get_history(symbol: str, questdb: QuestDBClient = Depends(get_questdb)):
    """Get historical klines for TradingView charts."""
    df = await questdb.get_recent_klines(symbol, limit=500)
    
    if df is None or len(df) == 0:
        return {"symbol": symbol, "data": []}
        
    # Convert to Lightweight Charts format
    # timestamp from QuestDB is string, we need unix timestamp in seconds
    # Assuming the string is ISO format, we can parse it
    
    data = []
    # If the df is fetched correctly, we iterate
    # Note: parsing logic depends on exact QuestDB output format.
    for row in df.iter_rows(named=True):
        import dateutil.parser
        dt = dateutil.parser.isoparse(row["timestamp"])
        
        data.append({
            "time": int(dt.timestamp()),
            "open": row["open"],
            "high": row["high"],
            "low": row["low"],
            "close": row["close"]
        })
        
    return {"symbol": symbol, "data": data}

@router.websocket("/ws/stream/{symbol}")
async def websocket_stream(websocket: WebSocket, symbol: str, redis: RedisClient = Depends(get_redis)):
    """
    WebSocket endpoint for live frontend updates.
    The frontend connects here, and we push Redis updates directly to it.
    """
    await websocket.accept()
    
    # We use Redis PubSub to listen for updates. 
    # The main loop writes to Redis Stream AND could publish to a channel, or we just poll the state key.
    # For a scalable approach, the engine should publish to a Redis PubSub channel after scoring.
    # To keep it simple here, we'll poll the state key 2 times a second.
    
    key = f"{settings.redis_state_prefix}:{symbol}:score"
    last_val = None
    
    try:
        import asyncio
        while True:
            val = await redis.client.get(key)
            if val and val != last_val:
                data = json.loads(val)
                data["type"] = "score_update"
                await websocket.send_json(data)
                last_val = val
                
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"WebSocket error: {e}")
        await websocket.close()
