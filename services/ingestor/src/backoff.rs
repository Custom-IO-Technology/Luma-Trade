use std::time::Duration;
use tracing::info;

/// Simple exponential backoff utility for reconnecting.
/// Starts at 1s, doubles each time up to max_delay.
pub struct ExponentialBackoff {
    current_delay: u64,
    max_delay: u64,
}

impl ExponentialBackoff {
    pub fn new(initial_delay_sec: u64, max_delay_sec: u64) -> Self {
        Self {
            current_delay: initial_delay_sec,
            max_delay: max_delay_sec,
        }
    }

    /// Reset the delay to the initial value (e.g. after a successful connection that lasts)
    pub fn reset(&mut self, initial_delay_sec: u64) {
        self.current_delay = initial_delay_sec;
    }

    /// Wait for the current delay, then increment the delay for next time.
    pub async fn wait(&mut self) {
        info!("Retrying connection in {} seconds...", self.current_delay);
        tokio::time::sleep(Duration::from_secs(self.current_delay)).await;
        
        self.current_delay *= 2;
        if self.current_delay > self.max_delay {
            self.current_delay = self.max_delay;
        }
    }
}

impl Default for ExponentialBackoff {
    fn default() -> Self {
        Self::new(1, 60)
    }
}
