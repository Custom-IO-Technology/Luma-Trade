use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Path, Query, State},
    response::IntoResponse,
};
use std::sync::Arc;
use tokio::time::{interval, Duration};
use crate::api::handlers::{AppState, HistoryQuery};
use crate::core::aggregator::aggregate_candles;
use crate::indicators::{EmaIndicator, MacdIndicator};
use crate::core::traits::{Indicator, Rule};
use crate::rules::{ConfidenceScorer, EmaPositionRule, MacdCrossRule};
use polars::prelude::*;
use crate::models::{ChartCandle, ScoreResult};

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(symbol): Path<String>,
    Query(query): Query<HistoryQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let interval_str = query.interval.unwrap_or_else(|| "30".to_string());
    ws.on_upgrade(move |socket| handle_socket(socket, symbol, interval_str, state))
}

async fn handle_socket(mut socket: WebSocket, symbol: String, interval_str: String, state: Arc<AppState>) {
    let bybit_symbol = crate::api::handlers::normalize_symbol(&symbol);
    let key = state.settings.zset_key_for_symbol(&bybit_symbol);
    
    let mut tick_interval = interval(Duration::from_millis(200));
    let mut score_throttle = interval(Duration::from_secs(2));
    
    let mut last_raw_msg = String::new();
    let mut last_confirmed_ts: u64 = 0;

    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    None | Some(Err(_)) => break,
                    Some(Ok(Message::Close(_))) => break,
                    _ => {}
                }
            }
            _ = tick_interval.tick() => {
                // FAST PATH: Poll Redis for price change
                let key_clone = key.clone();
                let latest_msg = match state.redis.zrange_last(&key_clone).await {
                    Ok(Some(msg)) => msg,
                    _ => continue,
                };
                
                let raw = serde_json::to_string(&latest_msg).unwrap_or_default();
                if raw != last_raw_msg {
                    last_raw_msg = raw;
                    
                    // Re-aggregate and push kline_update
                    let messages = match state.redis.zrange(&key_clone, 0, -1).await {
                        Ok(m) => m,
                        _ => continue,
                    };
                    
                    let df = match aggregate_candles(messages, &interval_str) {
                        Ok(d) => d,
                        _ => continue,
                    };
                    
                    if df.height() > 0 {
                        if let Some(msg) = build_kline_message(&bybit_symbol, &df) {
                            if socket.send(Message::Text(serde_json::to_string(&msg).unwrap())).await.is_err() {
                                break;
                            }
                        }
                    }
                }
            }
            _ = score_throttle.tick() => {
                // SLOW PATH: Full math
                let key_clone = key.clone();
                let messages = match state.redis.zrange(&key_clone, 0, -1).await {
                    Ok(m) => m,
                    _ => continue,
                };
                
                if messages.len() < 20 { continue; }
                
                let mut df = match aggregate_candles(messages, &interval_str) {
                    Ok(d) => d,
                    _ => continue,
                };
                
                // Indicators & Rules
                let indicators: Vec<Box<dyn Indicator>> = vec![
                    Box::new(EmaIndicator::new(55, "close")),
                    Box::new(EmaIndicator::new(200, "close")),
                    Box::new(MacdIndicator::new(12, 26, 9)),
                ];
                for indicator in indicators {
                    df = match indicator.compute(df.clone()) { Ok(d) => d, _ => continue };
                }
                
                let rules: Vec<Box<dyn Rule>> = vec![
                    Box::new(EmaPositionRule),
                    Box::new(MacdCrossRule),
                ];
                let scorer = ConfidenceScorer::new(rules);
                let result = scorer.score(&df, &bybit_symbol, "LONG", &state.settings);
                
                if socket.send(Message::Text(serde_json::to_string(&result).unwrap())).await.is_err() {
                    break;
                }
            }
        }
    }
}

fn build_kline_message(symbol: &str, df: &DataFrame) -> Option<serde_json::Value> {
    if df.height() == 0 { return None; }
    let idx = df.height() - 1;
    
    let time_col = df.column("time").and_then(|c| c.datetime()).ok()?;
    let open_col = df.column("open").and_then(|c| c.f64()).ok()?;
    let high_col = df.column("high").and_then(|c| c.f64()).ok()?;
    let low_col = df.column("low").and_then(|c| c.f64()).ok()?;
    let close_col = df.column("close").and_then(|c| c.f64()).ok()?;
    let vol_col = df.column("volume").and_then(|c| c.f64()).ok()?;
    
    Some(serde_json::json!({
        "type": "kline_update",
        "symbol": symbol,
        "data": {
            "time": time_col.get(idx)? / 1_000_000_000,
            "open": open_col.get(idx).unwrap_or(0.0),
            "high": high_col.get(idx).unwrap_or(0.0),
            "low": low_col.get(idx).unwrap_or(0.0),
            "close": close_col.get(idx).unwrap_or(0.0),
            "volume": vol_col.get(idx).unwrap_or(0.0),
        }
    }))
}
