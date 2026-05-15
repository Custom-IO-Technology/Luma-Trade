mod backoff;
mod bybit_client;
mod bybit_rest;
mod config;
mod exchange_trait;
mod questdb_writer;
mod redis_publisher;

use tracing::{error, info, warn, Level};
use tracing_subscriber::FmtSubscriber;

use crate::backoff::ExponentialBackoff;
use crate::bybit_client::BybitClient;
use crate::bybit_rest::BybitRestClient;
use crate::config::Config;
use crate::exchange_trait::ExchangeClient;
use crate::questdb_writer::QuestDbWriter;
use crate::redis_publisher::RedisPublisher;

fn build_zset_key(prefix: &str, symbol: &str) -> String {
    format!("{}:{}", prefix, symbol)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Setup logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("Starting Obscura Ingestor (Hard Boundary mode)...");

    // 2. Load Configuration
    let config = Config::from_env();
    info!("Configuration loaded. Symbols: {:?}", config.bybit_symbols);

    // 3. Initialize Sinks
    let redis_pub = RedisPublisher::new(&config.redis_url)?;
    let questdb_writer = QuestDbWriter::new(&config.questdb_ilp_host, config.questdb_ilp_port);

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. COLD START — Fetch 30 days of historical 5m candles from Bybit REST
    //    Seed QuestDB and Redis ZSET. Skip if ZSET already populated.
    // ═══════════════════════════════════════════════════════════════════════════
    let rest_client = BybitRestClient::new(&config.bybit_rest_url);

    for symbol in &config.bybit_symbols {
        let zset_key = build_zset_key(&config.redis_zset_prefix, symbol);

        let existing_count = match redis_pub.zcount(&zset_key).await {
            Ok(c) => c,
            Err(e) => {
                error!(error = %e, symbol = %symbol, "Failed to check ZSET count");
                0
            }
        };

        if existing_count > 0 {
            info!(
                symbol = %symbol,
                count = existing_count,
                "ZSET already populated, skipping cold start for {}",
                symbol
            );
            continue;
        }

        info!(
            symbol = %symbol,
            "Cold start: fetching 30 days of 5m historical candles"
        );

        let historical = match rest_client
            .fetch_30_days(symbol, &config.bybit_rest_interval)
            .await
        {
            Ok(candles) => candles,
            Err(e) => {
                error!(error = %e, symbol = %symbol, "Cold start REST fetch failed");
                continue;
            }
        };

        if historical.is_empty() {
            warn!(symbol = %symbol, "Cold start returned 0 candles, skipping");
            continue;
        }

        info!(
            symbol = %symbol,
            count = historical.len(),
            "Fetched historical candles, writing to sinks"
        );

        // Write to QuestDB (batch)
        questdb_writer.write_batch(&historical).await;

        // Write to Redis ZSET (batch, capped at max_size)
        if let Err(e) = redis_pub
            .zadd_batch(&zset_key, &historical, config.redis_zset_max_size)
            .await
        {
            error!(error = %e, symbol = %symbol, "Failed to batch ZADD");
        }
    }

    info!("Cold start complete. Entering live WebSocket loop.");

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. LIVE STREAM — Connect Bybit WebSocket, write to ZSET and QuestDB
    // ═══════════════════════════════════════════════════════════════════════════
    let mut backoff = ExponentialBackoff::default();

    loop {
        let mut exchange_client: Box<dyn ExchangeClient> =
            Box::new(BybitClient::new(&config.bybit_ws_url));

        info!("Attempting to connect to exchange...");
        if let Err(e) = exchange_client.connect().await {
            error!("Connection failed: {}", e);
            backoff.wait().await;
            continue;
        }

        if let Err(e) = exchange_client
            .subscribe(&config.bybit_symbols, &config.bybit_kline_interval)
            .await
        {
            error!("Subscription failed: {}", e);
            let _ = exchange_client.disconnect().await;
            backoff.wait().await;
            continue;
        }

        info!("Connected and subscribed. Listening for messages...");
        backoff.reset(1);

        loop {
            match exchange_client.next_message().await {
                Ok(Some(kline)) => {
                    let symbol = kline.symbol.clone();
                    let zset_key =
                        build_zset_key(&config.redis_zset_prefix, &kline.symbol);

                    // 1. Write to Redis ZSET (every tick — the Hard Boundary bridge)
                    if let Err(e) = redis_pub
                        .zadd_candle(&zset_key, &kline, config.redis_zset_max_size)
                        .await
                    {
                        error!(error = %e, symbol = %symbol, "ZSET write error");
                    }

                    // 2. Write confirmed candles to QuestDB (cold storage)
                    if kline.confirm {
                        questdb_writer.write(&kline).await;
                    }
                }
                Ok(None) => {
                    info!("Exchange disconnected normally.");
                    break;
                }
                Err(e) => {
                    error!("Stream error: {}", e);
                    break;
                }
            }
        }

        let _ = exchange_client.disconnect().await;
        backoff.wait().await;
    }
}
