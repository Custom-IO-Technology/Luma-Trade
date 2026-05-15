use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tracing::{debug, error, info};

use crate::exchange_trait::KlineMessage;

/// Writes data to QuestDB using the InfluxDB Line Protocol (ILP) over TCP.
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

    /// Build a single ILP line for a kline.
    fn build_ilp(kline: &KlineMessage) -> String {
        let timestamp_nanos = kline.timestamp * 1_000_000; // ms to ns
        format!(
            "klines,symbol={} open={},high={},low={},close={},volume={} {}\n",
            kline.symbol,
            kline.open,
            kline.high,
            kline.low,
            kline.close,
            kline.volume,
            timestamp_nanos
        )
    }

    /// Send a closed candle to QuestDB (single — for live stream).
    pub async fn write(&self, kline: &KlineMessage) {
        if !kline.confirm {
            return;
        }

        let address = format!("{}:{}", self.host, self.port);
        let symbol = kline.symbol.clone();
        let line = Self::build_ilp(kline);

        tokio::spawn(async move {
            let write_task = async {
                match TcpStream::connect(&address).await {
                    Ok(mut stream) => {
                        if let Err(e) = stream.write_all(line.as_bytes()).await {
                            error!(error = %e, "Failed to write ILP to QuestDB");
                        } else {
                            debug!(symbol = %symbol, "Written closed candle to QuestDB");
                        }
                    }
                    Err(e) => {
                        error!(error = %e, address = %address, "Failed to connect to QuestDB ILP port");
                    }
                }
            };
            let _ = tokio::time::timeout(Duration::from_secs(2), write_task).await;
        });
    }

    /// Batch-write multiple confirmed candles over a single TCP connection.
    /// Critical for cold start — avoids opening 8640 TCP connections.
    pub async fn write_batch(&self, klines: &[KlineMessage]) {
        let confirmed: Vec<&KlineMessage> = klines.iter().filter(|k| k.confirm).collect();
        if confirmed.is_empty() {
            return;
        }

        let address = format!("{}:{}", self.host, self.port);
        let count = confirmed.len();

        // Build multi-line ILP payload
        let payload: String = confirmed.iter().map(|k| Self::build_ilp(k)).collect();

        let result = tokio::time::timeout(Duration::from_secs(30), async {
            match TcpStream::connect(&address).await {
                Ok(mut stream) => {
                    stream.write_all(payload.as_bytes()).await?;
                    stream.flush().await?;
                    Ok::<_, std::io::Error>(())
                }
                Err(e) => Err(e),
            }
        })
        .await;

        match result {
            Ok(Ok(())) => info!(count = count, "Batch-wrote {} candles to QuestDB", count),
            Ok(Err(e)) => error!(error = %e, "QuestDB batch write failed"),
            Err(_) => error!("QuestDB batch write timed out after 30s"),
        }
    }
}
