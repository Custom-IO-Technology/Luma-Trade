import asyncio
import logging
import uvicorn
from fastapi import FastAPI
from contextlib import asynccontextmanager

from core.config import settings
from core.main_loop import MainLoop
from data_connectors.redis_client import RedisClient
from alerts.telegram_notifier import TelegramNotifier
from alerts.alert_dispatcher import AlertDispatcher
from api.routes import router

logging.basicConfig(level=getattr(logging, settings.engine_log_level))
logger = logging.getLogger(__name__)

# Global instances
engine_loop = None
engine_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting FastAPI application...")
    
    # Initialize Engine Components
    redis_client = RedisClient(settings.redis_url)
    telegram = TelegramNotifier(settings.telegram_bot_token, settings.telegram_chat_id)
    dispatcher = AlertDispatcher(telegram, settings.telegram_rate_limit_seconds)
    
    global engine_loop, engine_task
    engine_loop = MainLoop(broker=redis_client, alert_dispatcher=dispatcher)
    
    # Run engine loop as background task
    engine_task = asyncio.create_task(engine_loop.run())
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    if engine_loop:
        engine_loop.stop()
    if engine_task:
        engine_task.cancel()
        try:
            await engine_task
        except asyncio.CancelledError:
            pass

app = FastAPI(
    title="Obscura Logic Engine API",
    lifespan=lifespan
)

# Include routes
app.include_router(router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run("api.fastapi_app:app", host=settings.api_host, port=settings.api_port, reload=False)
