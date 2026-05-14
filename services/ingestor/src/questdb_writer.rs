use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tracing::{debug, error};

use crate::exchange_trait::KlineMessage;

/// Writes data to QuestDB using the InfluxDB Line Protocol (ILP) over TCP.
/// This acts as a fire-and-forget sink for "cold" historical data.
pub struct QuestDbWriter {
    host: String,
    port: u16,
}

impl QuestDbWriter {
    pub fn new(host: &str, port: u16) -> Self {
        Self {
            host: host.to_string(),
            port,
        }
    }

    /// Send a closed candle to QuestDB.
    /// Format: klines,symbol=BTCUSDT open=1.0,high=2.0,low=0.5,close=1.5,volume=100.0 <timestamp_nanos>
    pub async fn write(&self, kline: &KlineMessage) {
        // Only write closed candles to the DB to avoid overwriting partial data
        if !kline.confirm {
            return;
        }

        let address = format!("{}:{}", self.host, self.port);
        let timestamp_nanos = kline.timestamp * 1_000_000; // ms to ns

        let line = format!(
            "klines,symbol={} open={},high={},low={},close={},volume={} {}\n",
            kline.symbol,
            kline.open,
            kline.high,
            kline.low,
            kline.close,
            kline.volume,
            timestamp_nanos
        );

        // We use a short timeout and don't bubble up errors to prevent blocking the main loop
        let write_future = async {
            match TcpStream::connect(&address).await {
                Ok(mut stream) => {
                    if let Err(e) = stream.write_all(line.as_bytes()).await {
                        error!(error = %e, "Failed to write ILP to QuestDB");
                    } else {
                        debug!(symbol = %kline.symbol, "Written closed candle to QuestDB");
                    }
                }
                Err(e) => {
                    error!(error = %e, address = %address, "Failed to connect to QuestDB ILP port");
                }
            }
        };

        // Fire and forget, bounded by timeout
        tokio::spawn(async move {
            let _ = tokio::time::timeout(Duration::from_secs(2), write_future).await;
        });
    }
}
