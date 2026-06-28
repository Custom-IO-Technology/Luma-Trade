use reqwest::Client;
use serde::Deserialize;
use tracing::{debug, info};

use crate::exchange_trait::KlineMessage;

/// Bybit V5 REST API response wrapper.
#[derive(Debug, Deserialize)]
struct BybitResponse {
    #[serde(rename = "retCode")]
    ret_code: i32,
    #[serde(rename = "retMsg")]
    ret_msg: String,
    result: Option<BybitResult>,
}

#[derive(Debug, Deserialize)]
struct BybitResult {
    list: Vec<Vec<String>>,
}

/// Fetches historical kline data from Bybit REST API.
pub struct BybitRestClient {
    base_url: String,
    client: Client,
}

impl BybitRestClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            client: Client::new(),
        }
    }

    /// Fetch klines from Bybit REST API.
    /// Returns ascending order candles with `confirm: true`.
    pub async fn fetch_klines(
        &self,
        symbol: &str,
        interval: &str,
        limit: u32,
        end_ms: Option<u64>,
    ) -> Result<Vec<KlineMessage>, Box<dyn std::error::Error>> {
        let mut url = format!(
            "{}/v5/market/kline?category=linear&symbol={}&interval={}&limit={}",
            self.base_url, symbol, interval, limit
        );
        if let Some(end) = end_ms {
            url.push_str(&format!("&end={}", end));
        }

        let resp = self
            .client
            .get(&url)
            .send()
            .await?
            .json::<BybitResponse>()
            .await?;

        if resp.ret_code != 0 {
            return Err(format!("Bybit REST error {}: {}", resp.ret_code, resp.ret_msg).into());
        }

        let list = resp.result.ok_or("No result in Bybit response")?.list;

        // Bybit returns candles in descending time order (newest first).
        // We reverse to ascending and map to KlineMessage.
        // Each entry: [startTime(ms), open, high, low, close, volume, turnover]
        let mut candles: Vec<KlineMessage> = list
            .iter()
            .filter_map(|row| {
                if row.len() < 6 {
                    return None;
                }
                Some(KlineMessage {
                    symbol: symbol.to_string(),
                    open: row[1].parse().unwrap_or(0.0),
                    high: row[2].parse().unwrap_or(0.0),
                    low: row[3].parse().unwrap_or(0.0),
                    close: row[4].parse().unwrap_or(0.0),
                    volume: row[5].parse().unwrap_or(0.0),
                    timestamp: row[0].parse().unwrap_or(0),
                    confirm: true, // historical data is always confirmed
                })
            })
            .collect();

        candles.reverse(); // ascending order
        Ok(candles)
    }

    /// Fetch approximately 30 days of kline data by paginating the Bybit REST API.
    /// Returns deduplicated, ascending-order candles.
    pub async fn fetch_30_days(
        &self,
        symbol: &str,
        interval: &str,
    ) -> Result<Vec<KlineMessage>, Box<dyn std::error::Error>> {
        let max_limit: u32 = 200; // Bybit max per request
        let target_count: u32 = 8640; // 30 days of base candles (e.g. 5m or 30m)
        let _now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let mut all_candles: Vec<KlineMessage> = Vec::with_capacity(target_count as usize);
        let mut end_ms: Option<u64> = None;

        info!(
            symbol = %symbol,
            interval = %interval,
            "Starting historical fetch from Bybit REST"
        );

        loop {
            let batch = self
                .fetch_klines(symbol, interval, max_limit, end_ms)
                .await?;

            let batch_len = batch.len();
            if batch_len == 0 {
                break;
            }

            debug!(
                symbol = %symbol,
                batch_len = batch_len,
                total = all_candles.len(),
                "Fetched batch"
            );

            // Move the cursor back to before the earliest candle in this batch (oldest)
            end_ms = Some(batch[0].timestamp.saturating_sub(1));
            all_candles.extend(batch);

            if batch_len < max_limit as usize || all_candles.len() >= target_count as usize {
                break;
            }
        }

        // Deduplicate by timestamp (boundary candles may double-count)
        all_candles.sort_by_key(|c| c.timestamp);
        all_candles.dedup_by_key(|c| c.timestamp);

        // Truncate to last target_count worth of candles
        if all_candles.len() > target_count as usize {
            all_candles = all_candles.split_off(all_candles.len() - target_count as usize);
        }

        info!(
            symbol = %symbol,
            count = all_candles.len(),
            "Completed historical fetch"
        );

        Ok(all_candles)
    }
}
