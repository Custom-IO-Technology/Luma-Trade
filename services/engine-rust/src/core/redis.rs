use redis::{Client, AsyncCommands};
use anyhow::Result;
use crate::models::KlineMessage;

pub struct RedisClient {
    client: Client,
}

impl RedisClient {
    pub fn new(url: &str) -> Result<Self> {
        let client = Client::open(url)?;
        Ok(Self { client })
    }

    pub async fn zrange(&self, key: &str, start: isize, stop: isize) -> Result<Vec<KlineMessage>> {
        let mut conn = self.client.get_multiplexed_tokio_connection().await?;
        let raw: Vec<String> = conn.zrange(key, start, stop).await?;
        
        let messages = raw.into_iter()
            .filter_map(|s| serde_json::from_str(&s).ok())
            .collect();
            
        Ok(messages)
    }

    pub async fn zrange_last(&self, key: &str) -> Result<Option<KlineMessage>> {
        let mut conn = self.client.get_multiplexed_tokio_connection().await?;
        let raw: Vec<String> = conn.zrange(key, -1, -1).await?;
        
        if let Some(s) = raw.first() {
            return Ok(serde_json::from_str(s)?);
        }
        
        Ok(None)
    }
}
