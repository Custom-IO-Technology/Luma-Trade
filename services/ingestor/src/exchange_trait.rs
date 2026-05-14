use async_trait::async_trait;
use serde::{Deserialize, Serialize};

// =============================================================================
// KlineMessage — The universal candle format
// =============================================================================
/// Normalized kline/candle message that all exchange clients must produce.
/// This enforces LSP: any ExchangeClient can be swapped without changing
/// downstream processing logic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlineMessage {
    pub symbol: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub timestamp: u64, // Unix milliseconds
    pub confirm: bool,  // true = candle is closed
}

// =============================================================================
// ExchangeClient Trait — Liskov Substitution Principle (LSP)
// =============================================================================
/// Generic exchange client interface. Any exchange (Bybit, Binance, Polygon.io)
/// must implement this trait. The rest of the system never knows which exchange
/// is being used — it only works with this abstraction.
///
/// To add a new exchange:
/// 1. Create a new file (e.g., `binance_client.rs`)
/// 2. Implement `ExchangeClient` for your struct
/// 3. Select it in `main.rs` based on config
/// 4. Zero changes to redis_publisher.rs or questdb_writer.rs
#[async_trait]
pub trait ExchangeClient: Send + Sync {
    /// Establish the WebSocket connection to the exchange.
    async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error>>;

    /// Subscribe to kline streams for the given symbols and interval.
    async fn subscribe(
        &self,
        symbols: &[String],
        interval: &str,
    ) -> Result<(), Box<dyn std::error::Error>>;

    /// Block until the next kline message arrives.
    /// Returns `None` if the connection is closed.
    async fn next_message(&mut self) -> Result<Option<KlineMessage>, Box<dyn std::error::Error>>;

    /// Gracefully close the connection.
    async fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>>;
}
