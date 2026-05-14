import aiohttp
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class TelegramNotifier:
    """
    Sends formatted messages to Telegram Bot API.
    """
    
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = chat_id
        self.api_url = f"https://api.telegram.org/bot{token}/sendMessage"
        
    async def send(self, message: str) -> bool:
        if not self.token or not self.chat_id:
            logger.warning("Telegram token or chat_id not set, skipping alert.")
            return False
            
        payload = {
            "chat_id": self.chat_id,
            "text": message,
            "parse_mode": "HTML"
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Failed to send Telegram message: {error_text}")
                        return False
                    return True
        except Exception as e:
            logger.error(f"Exception sending Telegram message: {e}")
            return False
            
    def format_alert(self, symbol: str, score_data: Dict[str, Any]) -> str:
        """Format the score payload into an HTML Telegram message."""
        direction = score_data.get("direction", "UNKNOWN")
        score = score_data.get("score", 0)
        decision = score_data.get("decision", "")
        
        # Emoji mapping
        dir_emoji = "🟢" if direction == "LONG" else "🔴"
        
        msg = f"<b>{dir_emoji} {symbol} | {direction} SIGNAL</b>\n\n"
        msg += f"<b>Score:</b> {score}/100\n"
        msg += f"<b>Decision:</b> {decision}\n\n"
        msg += "<b>Rule Breakdown:</b>\n"
        
        for rule in score_data.get("rules_payload", []):
            passed = "✅" if rule.get("passed") else "❌"
            pts = rule.get("points", 0)
            msg += f"{passed} {rule.get('name')} (+{pts})\n"
            
        msg += "\n<i>Obscura Trading Engine</i>"
        return msg
