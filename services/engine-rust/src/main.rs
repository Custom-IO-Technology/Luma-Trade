mod config;
mod core;
mod indicators;
mod models;
mod rules;
mod api;

use axum::{
    routing::get,
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Settings;
use crate::core::redis::RedisClient;
use crate::api::handlers::{get_history, get_score, AppState};
use crate::api::websocket::ws_handler;

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let settings = Settings::from_env();
    let redis_client = Arc::new(RedisClient::new(&settings.redis_url).expect("Failed to connect to Redis"));
    
    let state = Arc::new(AppState {
        settings: settings.clone(),
        redis: redis_client,
    });

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/history/:symbol", get(get_history))
        .route("/api/widgets/score/:symbol", get(get_score))
        .route("/api/ws/stream/:symbol", get(ws_handler))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], settings.api_port));
    tracing::info!("Obscura Rust Engine listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
