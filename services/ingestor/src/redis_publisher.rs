use redis::AsyncCommands;
use tracing::{debug, error};

use crate::exchange_trait::KlineMessage;

/// Publishes market data to Redis Streams.
pub struct RedisPublisher {
    client: redis::Client,
    stream_key: String,
}

impl RedisPublisher {
    pub fn new(redis_url: &str, stream_key: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let client = redis::Client::open(redis_url)?;
        Ok(Self {
            client,
            stream_key: stream_key.to_string(),
        })
    }

    /// Pushes a KlineMessage to the configured Redis Stream.
    /// Uses MAXLEN to prevent unbounded memory growth.
    pub async fn publish(&self, kline: &KlineMessage) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.client.get_multiplexed_tokio_connection().await?;
        
        let payload = serde_json::to_string(kline)?;
        
        // XADD market:kline:5m MAXLEN ~ 10000 * symbol BTCUSDT data <json>
        let result: redis::RedisResult<String> = redis::cmd("XADD")
            .arg(&self.stream_key)
            .arg("MAXLEN")
            .arg("~")
            .arg(10000)
            .arg("*")
            .arg("symbol")
            .arg(&kline.symbol)
            .arg("data")
            .arg(&payload)
            .query_async(&mut conn)
            .await;

        match result {
            Ok(id) => {
                debug!(id = %id, symbol = %kline.symbol, "Published to Redis Stream");
                Ok(())
            }
            Err(e) => {
                error!(error = %e, "Failed to publish to Redis Stream");
                Err(Box::new(e))
            }
        }
    }
}
