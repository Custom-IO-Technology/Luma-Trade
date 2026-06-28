import os
import requests
import io

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

def send_telegram_message(message: str) -> bool:
    """
    Sends a text message to the configured Telegram chat.
    Supports Markdown formatting.
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[Telegram Helper Warning] Bot token or Chat ID not configured.")
        return False
        
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"[Telegram Helper Error] Failed to send message: {e}")
        return False

def send_telegram_photo(image_bytes: bytes, caption: str = "") -> bool:
    """
    Sends an image file (e.g. chart screenshot) to the configured Telegram chat.
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[Telegram Helper Warning] Bot token or Chat ID not configured.")
        return False
        
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendPhoto"
    
    try:
        files = {
            "photo": ("chart.png", io.BytesIO(image_bytes), "image/png")
        }
        data = {
            "chat_id": TELEGRAM_CHAT_ID,
            "caption": caption,
            "parse_mode": "Markdown"
        }
        response = requests.post(url, data=data, files=files, timeout=15)
        response.raise_for_status()
        return True
    except Exception as e:
        print(f"[Telegram Helper Error] Failed to send photo: {e}")
        return False
