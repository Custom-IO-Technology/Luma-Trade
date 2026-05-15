use axum::{
    extract::{Path, Query, State},
    Json,
    http::StatusCode,
};
use serde::Deserialize;
use std::sync::Arc;
use crate::config::Settings;
use crate::core::redis::RedisClient;
use crate::core::aggregator::aggregate_candles;
use crate::models::{ChartCandle, ScoreResult};
use crate::indicators::{EmaIndicator, MacdIndicator};
use crate::core::traits::{Indicator, Rule};
use crate::rules::{ConfidenceScorer, EmaPositionRule, MacdCrossRule};
use polars::prelude::*;

#[derive(Clone)]
pub struct AppState {
    pub settings: Settings,
    pub redis: Arc<RedisClient>,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub interval: Option<String>,
}

pub async fn get_history(
    Path(symbol): Path<String>,
    Query(query): Query<HistoryQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let interval = query.interval.unwrap_or_else(|| "5".to_string());
    let bybit_symbol = normalize_symbol(&symbol);
    let key = state.settings.zset_key_for_symbol(&bybit_symbol);

    let messages = state.redis.zrange(&key, 0, -1).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if messages.is_empty() {
        return Ok(Json(serde_json::json!({
            "symbol": bybit_symbol,
            "data": [],
            "message": "No data yet."
        })));
    }

    let df = aggregate_candles(messages, &interval)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if df.height() == 0 {
        return Ok(Json(serde_json::json!({"symbol": bybit_symbol, "data": []})));
    }

    // Convert to ChartCandle format
    let mut data = Vec::with_capacity(df.height());
    let time_col = df.column("time").and_then(|c| c.datetime()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let open_col = df.column("open").and_then(|c| c.f64()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let high_col = df.column("high").and_then(|c| c.f64()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let low_col = df.column("low").and_then(|c| c.f64()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let close_col = df.column("close").and_then(|c| c.f64()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let vol_col = df.column("volume").and_then(|c| c.f64()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    for i in 0..df.height() {
        if let (Some(t), Some(o), Some(h), Some(l), Some(c), Some(v)) = (
            time_col.get(i),
            open_col.get(i),
            high_col.get(i),
            low_col.get(i),
            close_col.get(i),
            vol_col.get(i),
        ) {
            data.push(ChartCandle {
                time: t / 1_000_000_000, // ns to s
                open: o,
                high: h,
                low: l,
                close: c,
                volume: v,
            });
        }
    }

    Ok(Json(serde_json::json!({
        "symbol": bybit_symbol,
        "data": data
    })))
}

#[derive(Deserialize)]
pub struct ScoreQuery {
    pub interval: Option<String>,
    pub direction: Option<String>,
}

pub async fn get_score(
    Path(symbol): Path<String>,
    Query(query): Query<ScoreQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<ScoreResult>, StatusCode> {
    let interval = query.interval.unwrap_or_else(|| "5".to_string());
    let direction = query.direction.unwrap_or_else(|| "LONG".to_string());
    let bybit_symbol = normalize_symbol(&symbol);
    let key = state.settings.zset_key_for_symbol(&bybit_symbol);

    let messages = state.redis.zrange(&key, 0, -1).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if messages.len() < 20 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let mut df = aggregate_candles(messages, &interval)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Run indicators
    let indicators: Vec<Box<dyn Indicator>> = vec![
        Box::new(EmaIndicator::new(55, "close")),
        Box::new(EmaIndicator::new(200, "close")),
        Box::new(MacdIndicator::new(12, 26, 9)),
    ];

    for indicator in indicators {
        df = indicator.compute(df).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    // Score
    let rules: Vec<Box<dyn Rule>> = vec![
        Box::new(EmaPositionRule),
        Box::new(MacdCrossRule),
    ];

    let scorer = ConfidenceScorer::new(rules);
    let result = scorer.score(&df, &bybit_symbol, &direction, &state.settings);

    Ok(Json(result))
}

pub fn normalize_symbol(symbol: &str) -> String {
    if symbol == "SOLANA" {
        return "SOLUSDT".to_string();
    }
    if !symbol.ends_with("USDT") {
        return format!("{}USDT", symbol);
    }
    symbol.to_string()
}
