use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlineMessage {
    pub symbol: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub timestamp: u64, // Unix milliseconds
    pub confirm: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartCandle {
    pub time: i64, // Unix seconds
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleResult {
    pub name: String,
    pub passed: bool,
    pub points: u8,
    pub weight: u8,
    pub comment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreResult {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub symbol: String,
    pub score: i32,
    pub status: String,
    pub level: String,
    pub decision: String,
    pub hard_rules_met: bool,
    pub rules_payload: Vec<RuleResult>,
    pub timestamp: i64,
}
