use serde::Deserialize;

/// Application configuration loaded from environment variables.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub bybit_ws_url: String,
    pub bybit_symbols: Vec<String>,
    pub bybit_kline_interval: String,
    pub redis_url: String,
    pub redis_stream_key: String,
    pub questdb_ilp_host: String,
    pub questdb_ilp_port: u16,
    pub bybit_rest_url: String,
    pub redis_zset_prefix: String,
    pub redis_zset_max_size: usize,
    pub bybit_rest_interval: String,
}

impl Config {
    /// Load configuration from environment variables.
    /// Panics on missing required variables — fail fast on startup.
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let symbols_raw = std::env::var("BYBIT_SYMBOLS")
            .unwrap_or_else(|_| "BTCUSDT,ETHUSDT".to_string());

        Config {
            bybit_ws_url: std::env::var("BYBIT_WS_URL")
                .unwrap_or_else(|_| "wss://stream.bybit.com/v5/public/linear".to_string()),
            bybit_symbols: symbols_raw
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            bybit_kline_interval: std::env::var("BYBIT_KLINE_INTERVAL")
                .unwrap_or_else(|_| "5".to_string()),
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://redis:6379".to_string()),
            redis_stream_key: std::env::var("REDIS_STREAM_KEY")
                .unwrap_or_else(|_| "market:kline:5m".to_string()),
            questdb_ilp_host: std::env::var("QUESTDB_ILP_HOST")
                .unwrap_or_else(|_| "questdb".to_string()),
            questdb_ilp_port: std::env::var("QUESTDB_ILP_PORT")
                .unwrap_or_else(|_| "9009".to_string())
                .parse()
                .expect("QUESTDB_ILP_PORT must be a valid u16"),
            bybit_rest_url: std::env::var("BYBIT_REST_URL")
                .unwrap_or_else(|_| "https://api.bybit.com".to_string()),
            redis_zset_prefix: std::env::var("REDIS_ZSET_PREFIX")
                .unwrap_or_else(|_| "market:kline:5m".to_string()),
            redis_zset_max_size: std::env::var("REDIS_ZSET_MAX_SIZE")
                .unwrap_or_else(|_| "8640".to_string())
                .parse()
                .expect("REDIS_ZSET_MAX_SIZE must be a valid usize"),
            bybit_rest_interval: std::env::var("BYBIT_REST_INTERVAL")
                .unwrap_or_else(|_| "5".to_string()),
        }
    }
}
