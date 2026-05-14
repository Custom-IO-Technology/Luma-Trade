import asyncio
import logging
import polars as pl
from typing import Dict, Any

from core.message_broker import MessageBroker
from core.config import settings
from indicators import get_all_indicators
from rules_engine import get_scorer
from alerts.alert_dispatcher import AlertDispatcher

logger = logging.getLogger(__name__)

class MainLoop:
    """
    The async runner that orchestrates components:
    consume -> compute -> publish
    """
    
    def __init__(self, broker: MessageBroker, alert_dispatcher: AlertDispatcher):
        self.broker = broker
        self.alert_dispatcher = alert_dispatcher
        self.indicators = get_all_indicators()
        self.scorer = get_scorer()
        self._running = False
        
        # State cache for dataframes: symbol -> pl.DataFrame
        self.df_cache: Dict[str, pl.DataFrame] = {}
        
    def _append_tick(self, symbol: str, tick: Dict[str, Any]):
        """Append a new tick to the DataFrame cache."""
        # Convert tick to Polars DataFrame row
        row = pl.DataFrame([tick])
        
        if symbol not in self.df_cache:
            self.df_cache[symbol] = row
        else:
            # Append and keep max 500 candles to prevent memory growth
            self.df_cache[symbol] = pl.concat([self.df_cache[symbol], row]).tail(500)
            
    def _compute_indicators(self, symbol: str) -> pl.DataFrame:
        """Run all indicators concurrently on the DataFrame."""
        df = self.df_cache[symbol]
        for indicator in self.indicators:
            df = indicator.compute(df)
        return df

    async def run(self):
        self._running = True
        logger.info("Starting engine main loop...")
        
        # Start consuming from Redis
        try:
            async for tick in self.broker.consume(
                stream=settings.redis_stream_key,
                group=settings.redis_consumer_group
            ):
                if not self._running:
                    break
                    
                symbol = tick.get("symbol")
                if not symbol:
                    continue
                    
                # 1. Update state
                self._append_tick(symbol, tick)
                
                # 2. Compute indicators
                df = self._compute_indicators(symbol)
                
                # 3. Evaluate rules (we run for both LONG and SHORT logic)
                # In a real app, direction might be inferred from trend or evaluated on both
                # For this implementation, we'll evaluate both and pick the one that passes
                
                long_score = self.scorer.score(df, "LONG")
                short_score = self.scorer.score(df, "SHORT")
                
                best_score = long_score if long_score["score"] >= short_score["score"] else short_score
                
                # 4. Update state cache in Redis for UI
                state_key = f"{settings.redis_state_prefix}:{symbol}:score"
                await self.broker.set_state(state_key, best_score)
                
                # 5. Dispatch alerts if passed
                if best_score["status"] == "PASS" and tick.get("confirm", False):
                    # Only alert on closed candles to avoid spam
                    await self.alert_dispatcher.dispatch(symbol, best_score)
                    
        except asyncio.CancelledError:
            logger.info("Main loop cancelled")
        except Exception as e:
            logger.error(f"Error in main loop: {e}", exc_info=True)
        finally:
            self._running = False
            
    def stop(self):
        self._running = False
