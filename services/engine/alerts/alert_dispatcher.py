import time
import logging
from typing import Dict, Any
from .telegram_notifier import TelegramNotifier

logger = logging.getLogger(__name__)

class AlertDispatcher:
    """
    Routes alerts to correct channels with rate limiting.
    """
    
    def __init__(self, telegram: TelegramNotifier, rate_limit_sec: int = 300):
        self.telegram = telegram
        self.rate_limit_sec = rate_limit_sec
        self.last_alert_times: Dict[str, float] = {} # symbol -> timestamp
        
    async def dispatch(self, symbol: str, score_data: Dict[str, Any]):
        """Dispatch an alert if it hasn't been sent recently."""
        now = time.time()
        last_time = self.last_alert_times.get(symbol, 0)
        
        if now - last_time < self.rate_limit_sec:
            logger.debug(f"Alert for {symbol} rate limited. Skipping.")
            return
            
        # Format and send
        msg = self.telegram.format_alert(symbol, score_data)
        
        logger.info(f"Dispatching alert for {symbol} with score {score_data.get('score')}")
        success = await self.telegram.send(msg)
        
        if success:
            self.last_alert_times[symbol] = now
