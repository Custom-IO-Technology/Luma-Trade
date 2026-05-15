pub mod aggregator;
pub mod redis;
pub mod traits;

pub use aggregator::aggregate_candles;
pub use redis::RedisClient;
pub use traits::{Indicator, Rule};
