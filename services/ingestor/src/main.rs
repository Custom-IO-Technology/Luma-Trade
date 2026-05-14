mod backoff;
mod bybit_client;
mod config;
mod exchange_trait;
mod questdb_writer;
mod redis_publisher;

use tracing::{error, info, Level};
use tracing_subscriber::FmtSubscriber;

use crate::backoff::ExponentialBackoff;
use crate::bybit_client::BybitClient;
use crate::config::Config;
use crate::exchange_trait::ExchangeClient;
use crate::questdb_writer::QuestDbWriter;
use crate::redis_publisher::RedisPublisher;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Setup logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("Starting Obscura Ingestor...");

    // 2. Load Configuration
    let config = Config::from_env();
    info!("Configuration loaded. Symbols: {:?}", config.bybit_symbols);

    // 3. Initialize Sinks (Redis and QuestDB)
    let redis_pub = RedisPublisher::new(&config.redis_url, &config.redis_stream_key)?;
    let questdb_writer = QuestDbWriter::new(&config.questdb_ilp_host, config.questdb_ilp_port);

    // 4. Main Event Loop with Exponential Backoff
    let mut backoff = ExponentialBackoff::default();

    loop {
        // Instantiate the Exchange Client (Bybit)
        let mut exchange_client: Box<dyn ExchangeClient> =
            Box::new(BybitClient::new(&config.bybit_ws_url));

        info!("Attempting to connect to exchange...");
        if let Err(e) = exchange_client.connect().await {
            error!("Connection failed: {}", e);
            backoff.wait().await;
            continue;
        }

        // Subscribe to configured streams
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
        backoff.reset(1); // Reset backoff on successful connection

        // Read messages
        loop {
            match exchange_client.next_message().await {
                Ok(Some(kline)) => {
                    // 1. Publish all ticks to Redis (Hot Data)
                    if let Err(e) = redis_pub.publish(&kline).await {
                        error!("Redis publish error: {}", e);
                        // We do not break the loop for a Redis error, we keep trying
                    }

                    // 2. Write closed candles to QuestDB (Cold Data)
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
