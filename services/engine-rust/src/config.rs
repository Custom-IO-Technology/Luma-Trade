use serde::Deserialize;
use std::env;

#[derive(Debug, Deserialize, Clone)]
pub struct Settings {
    pub redis_url: String,
    pub redis_zset_prefix: String,
    pub api_host: String,
    pub api_port: u16,
    pub score_full_size_threshold: i32,
    pub score_scaled_size_threshold: i32,
    pub bybit_symbols: String,
}

impl Settings {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();
        
        Self {
            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string()),
            redis_zset_prefix: env::var("REDIS_ZSET_PREFIX").unwrap_or_else(|_| "market:kline:5m".to_string()),
            api_host: env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            api_port: env::var("API_PORT")
                .unwrap_or_else(|_| "8000".to_string())
                .parse()
                .unwrap_or(8000),
            score_full_size_threshold: env::var("SCORE_FULL_SIZE_THRESHOLD")
                .unwrap_or_else(|_| "90".to_string())
                .parse()
                .unwrap_or(90),
            score_scaled_size_threshold: env::var("SCORE_SCALED_SIZE_THRESHOLD")
                .unwrap_or_else(|_| "70".to_string())
                .parse()
                .unwrap_or(70),
            bybit_symbols: env::var("BYBIT_SYMBOLS")
                .unwrap_or_else(|_| "BTCUSDT,ETHUSDT,SOLUSDT,LINKUSDT,INJUSDT".to_string()),
        }
    }

    pub fn symbols_list(&self) -> Vec<String> {
        self.bybit_symbols
            .split(',')
            .map(|s| s.trim().to_string())
            .collect()
    }

    pub fn zset_key_for_symbol(&self, symbol: &str) -> String {
        format!("{}:{}", self.redis_zset_prefix, symbol)
    }
}
