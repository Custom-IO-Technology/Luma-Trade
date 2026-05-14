use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, info, warn};

use crate::exchange_trait::{ExchangeClient, KlineMessage};

/// Bybit V5 Public WebSocket client implementing the ExchangeClient trait.
/// This is the concrete implementation for Bybit — to add Binance, create
/// a `binance_client.rs` that also implements ExchangeClient (LSP).
pub struct BybitClient {
    url: String,
    ws_stream: Option<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
}

impl BybitClient {
    pub fn new(url: &str) -> Self {
        Self {
            url: url.to_string(),
            ws_stream: None,
        }
    }
}

#[async_trait]
impl ExchangeClient for BybitClient {
    async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        info!(url = %self.url, "Connecting to Bybit WebSocket...");
        let (ws_stream, response) = connect_async(&self.url).await?;
        info!(status = ?response.status(), "Connected to Bybit");
        self.ws_stream = Some(ws_stream);
        Ok(())
    }

    async fn subscribe(
        &self,
        symbols: &[String],
        interval: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let ws = self
            .ws_stream
            .as_ref()
            .ok_or("WebSocket not connected")?;

        let topics: Vec<String> = symbols
            .iter()
            .map(|s| format!("kline.{}.{}", interval, s))
            .collect();

        let sub_msg = json!({
            "op": "subscribe",
            "args": topics
        });

        info!(topics = ?topics, "Subscribing to kline streams");

        // We need mutable access to send — this is a design consideration.
        // In production, you'd split the stream into read/write halves.
        // For now, the subscribe happens right after connect before the read loop.
        // The actual send will be handled in main.rs after splitting the stream.
        debug!(message = %sub_msg, "Subscription message prepared");

        Ok(())
    }

    async fn next_message(&mut self) -> Result<Option<KlineMessage>, Box<dyn std::error::Error>> {
        let ws = self
            .ws_stream
            .as_mut()
            .ok_or("WebSocket not connected")?;

        while let Some(msg_result) = ws.next().await {
            match msg_result {
                Ok(Message::Text(text)) => {
                    // Parse Bybit V5 kline response
                    let parsed: serde_json::Value = serde_json::from_str(&text)?;

                    // Skip non-kline messages (pong, subscription confirmations)
                    let topic = parsed.get("topic").and_then(|t| t.as_str());
                    if topic.is_none() || !topic.unwrap().starts_with("kline.") {
                        debug!(raw = %text, "Non-kline message, skipping");
                        continue;
                    }

                    // Extract kline data from Bybit V5 format
                    if let Some(data_array) = parsed.get("data").and_then(|d| d.as_array()) {
                        for candle in data_array {
                            let symbol = topic
                                .unwrap()
                                .split('.')
                                .last()
                                .unwrap_or("UNKNOWN")
                                .to_string();

                            let kline = KlineMessage {
                                symbol,
                                open: candle["open"]
                                    .as_str()
                                    .unwrap_or("0")
                                    .parse()
                                    .unwrap_or(0.0),
                                high: candle["high"]
                                    .as_str()
                                    .unwrap_or("0")
                                    .parse()
                                    .unwrap_or(0.0),
                                low: candle["low"]
                                    .as_str()
                                    .unwrap_or("0")
                                    .parse()
                                    .unwrap_or(0.0),
                                close: candle["close"]
                                    .as_str()
                                    .unwrap_or("0")
                                    .parse()
                                    .unwrap_or(0.0),
                                volume: candle["volume"]
                                    .as_str()
                                    .unwrap_or("0")
                                    .parse()
                                    .unwrap_or(0.0),
                                timestamp: candle["start"]
                                    .as_u64()
                                    .unwrap_or(0),
                                confirm: candle["confirm"]
                                    .as_bool()
                                    .unwrap_or(false),
                            };

                            return Ok(Some(kline));
                        }
                    }
                }
                Ok(Message::Ping(data)) => {
                    debug!("Received ping, pong handled automatically");
                    // tungstenite handles pong automatically
                }
                Ok(Message::Close(_)) => {
                    warn!("WebSocket closed by server");
                    return Ok(None);
                }
                Err(e) => {
                    return Err(Box::new(e));
                }
                _ => continue,
            }
        }

        Ok(None) // Stream ended
    }

    async fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(mut ws) = self.ws_stream.take() {
            ws.close(None).await?;
            info!("Disconnected from Bybit");
        }
        Ok(())
    }
}
