from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    redis_url: str = "redis://redis:6379"
    redis_stream_key: str = "market:kline:5m"
    redis_consumer_group: str = "engine-group"
    redis_state_prefix: str = "state"
    
    questdb_http_url: str = "http://questdb:9000"
    
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    telegram_rate_limit_seconds: int = 300
    
    engine_log_level: str = "INFO"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    
    score_full_size_threshold: int = 90
    score_scaled_size_threshold: int = 70
    
    bybit_symbols: str = "BTCUSDT,ETHUSDT"

    @property
    def symbols_list(self) -> List[str]:
        return [s.strip() for s in self.bybit_symbols.split(',')]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
