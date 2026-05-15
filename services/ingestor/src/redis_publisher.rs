use redis::AsyncCommands;
use tracing::{debug, info};

use crate::exchange_trait::KlineMessage;

/// Publishes market data to Redis Streams and Sorted Sets.
pub struct RedisPublisher {
    client: redis::Client,
}

impl RedisPublisher {
    pub fn new(redis_url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let client = redis::Client::open(redis_url)?;
        Ok(Self { client })
    }

    // ─── ZSET Methods (Hard Boundary data bridge) ─────────────────────────────

    /// Add or update a single candle in a Redis Sorted Set.
    /// Score = timestamp in milliseconds. Member = JSON-serialized KlineMessage.
    /// Removes any existing entry at the same timestamp (for unconfirmed→confirmed updates).
    /// Trims the set to `max_size` by removing oldest entries.
    pub async fn zadd_candle(
        &self,
        zset_key: &str,
        kline: &KlineMessage,
        max_size: usize,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.client.get_multiplexed_tokio_connection().await?;
        let payload = serde_json::to_string(kline)?;
        let score = kline.timestamp as f64;

        // Pipeline: dedup at same score, add new, trim to max
        redis::pipe()
            .cmd("ZREMRANGEBYSCORE")
            .arg(zset_key)
            .arg(score)
            .arg(score)
            .cmd("ZADD")
            .arg(zset_key)
            .arg(score)
            .arg(&payload)
            .cmd("ZREMRANGEBYRANK")
            .arg(zset_key)
            .arg(0)
            .arg(-((max_size as isize) + 1))
            .query_async::<_, ()>(&mut conn)
            .await?;

        debug!(
            symbol = %kline.symbol,
            score = score,
            "ZADD to {}",
            zset_key
        );
        Ok(())
    }

    /// Batch-add multiple candles to a Redis Sorted Set (for cold start seeding).
    /// Uses a single pipelined ZADD followed by a trim.
    pub async fn zadd_batch(
        &self,
        zset_key: &str,
        klines: &[KlineMessage],
        max_size: usize,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if klines.is_empty() {
            return Ok(());
        }

        let mut conn = self.client.get_multiplexed_tokio_connection().await?;

        // Build pipeline: ZADD with all score-member pairs
        let mut pipe = redis::pipe();
        for kline in klines {
            let payload = serde_json::to_string(kline)?;
            pipe.cmd("ZADD")
                .arg(zset_key)
                .arg(kline.timestamp as f64)
                .arg(&payload);
        }
        // Trim
        pipe.cmd("ZREMRANGEBYRANK")
            .arg(zset_key)
            .arg(0)
            .arg(-((max_size as isize) + 1));

        pipe.query_async::<_, ()>(&mut conn).await?;

        info!(
            count = klines.len(),
            key = %zset_key,
            "Batch ZADD complete"
        );
        Ok(())
    }

    /// Check how many members are in a sorted set.
    pub async fn zcount(&self, zset_key: &str) -> Result<usize, Box<dyn std::error::Error>> {
        let mut conn = self.client.get_multiplexed_tokio_connection().await?;
        let count: usize = conn.zcount(zset_key, "-inf", "+inf").await?;
        Ok(count)
    }
}
