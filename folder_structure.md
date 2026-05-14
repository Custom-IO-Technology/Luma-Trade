# Obscura Trading Engine — Folder Structure

> [!IMPORTANT]
> This is the canonical folder structure for the **Lumina Trade / Obscura** Trading Engine. Every file listed below has been scaffolded in the workspace.

## Complete Tree

```
Lumina Trade/
│
├── docker-compose.yml              # Production orchestration (Section 7.5)
├── docker-compose.dev.yml          # Local development overrides
├── .env.example                    # Template for secrets
├── .env.production                 # NEVER committed — API keys live here
├── .gitignore
├── README.md
│
├── services/
│   │
│   ├── ingestor/                   # ══ RUST — "The Shield" (Section 5.1) ══
│   │   ├── Cargo.toml              # Deps: tokio, tungstenite, redis, questdb-ilp
│   │   ├── Dockerfile              # Multi-stage: rust:bullseye → debian:bullseye-slim
│   │   ├── .env.example
│   │   ├── src/
│   │   │   ├── main.rs             # Tokio entry point, spawns WS + writer tasks
│   │   │   ├── config.rs           # Env-based configuration (symbols, intervals)
│   │   │   ├── exchange_trait.rs   # LSP — Generic ExchangeClient trait (Bybit/Binance)
│   │   │   ├── bybit_client.rs     # Implements ExchangeClient for Bybit V5 WS
│   │   │   ├── ws_client.rs        # Low-level WebSocket connection manager
│   │   │   ├── redis_publisher.rs  # Publishes raw ticks → Redis Stream market:kline:5m
│   │   │   ├── questdb_writer.rs   # ILP over TCP:9009 — fire-and-forget cold storage
│   │   │   └── backoff.rs          # Exponential backoff (1s, 2s, 4s, 8s…)
│   │   └── tests/
│   │       └── integration_test.rs
│   │
│   ├── engine/                     # ══ PYTHON — "The Brain" (Sections 5.3–5.5) ══
│   │   ├── Dockerfile              # python:3.11-slim + wheels only
│   │   ├── requirements.txt
│   │   ├── pyproject.toml
│   │   │
│   │   ├── core/                   # Orchestration & abstractions
│   │   │   ├── __init__.py
│   │   │   ├── event_bus.py        # DIP — Abstract MessageBroker interface
│   │   │   ├── message_broker.py   # DIP — Protocol/ABC for broker implementations
│   │   │   ├── main_loop.py        # The async runner: consume → compute → publish
│   │   │   └── config.py           # Pydantic Settings for env-based config
│   │   │
│   │   ├── data_connectors/        # SRP — Only handle network I/O
│   │   │   ├── __init__.py
│   │   │   ├── redis_client.py     # Implements MessageBroker → Redis Streams
│   │   │   └── questdb_client.py   # Read-only queries for historical backfill
│   │   │
│   │   ├── indicators/             # OCP — Add new files, never modify old ones
│   │   │   ├── __init__.py         # Auto-discovers & registers all indicators
│   │   │   ├── base_indicator.py   # AbstractIndicator base class
│   │   │   ├── ema.py              # EMA 55 & EMA 200
│   │   │   ├── macd.py             # MACD (12, 26, 9)
│   │   │   ├── vwma.py             # VWMA 20
│   │   │   ├── stoch_rsi.py        # Stochastic RSI
│   │   │   ├── bollinger_bands.py  # Bollinger Bands (20, 2)
│   │   │   └── atr.py              # Average True Range
│   │   │
│   │   ├── rules_engine/           # OCP + Strategy Pattern
│   │   │   ├── __init__.py
│   │   │   ├── base_rule.py        # AbstractRule — evaluate() + get_points()
│   │   │   ├── rule_bb_cross.py    # Rule 1: BB Cross         (+20 pts)
│   │   │   ├── rule_candle_confirm.py # Rule 2: Candle Confirm (+15 pts)
│   │   │   ├── rule_volume.py      # Rule 3: Volume           (+15 pts)
│   │   │   ├── rule_macd.py        # Rule 4: MACD             (+10 pts)
│   │   │   ├── rule_stoch_rsi.py   # Rule 5: Stoch RSI        (+10 pts)
│   │   │   ├── rule_ema_position.py # Rule 6: EMA Position    (+15 pts)
│   │   │   ├── rule_vwma_trend.py  # Rule 7: VWMA Trend       (+10 pts)
│   │   │   ├── rule_atr.py         # Rule 8: ATR              (+5 pts)
│   │   │   ├── hard_rules_gate.py  # Enforces non-negotiable hard rules
│   │   │   └── confidence_scorer.py # Loops through all rules dynamically
│   │   │
│   │   ├── alerts/                 # SRP — Only handles outbound notifications
│   │   │   ├── __init__.py
│   │   │   ├── alert_dispatcher.py # Routes alerts to correct channel
│   │   │   └── telegram_notifier.py # aiohttp → Telegram Bot API
│   │   │
│   │   ├── api/                    # ISP — Lightweight endpoints for the dashboard
│   │   │   ├── __init__.py
│   │   │   ├── fastapi_app.py      # FastAPI application factory
│   │   │   ├── routes.py           # /api/widgets/score, /api/history/{symbol}
│   │   │   └── schemas.py          # Pydantic response models
│   │   │
│   │   └── tests/
│   │       ├── __init__.py
│   │       ├── test_indicators.py
│   │       ├── test_rules.py
│   │       └── test_confidence_scorer.py
│   │
│   └── dashboard/                  # ══ REACT — "Obscura UI" (Section 6) ══
│       ├── Dockerfile              # Multi-stage: Node build → nginx:alpine
│       ├── package.json
│       ├── vite.config.js
│       ├── index.html
│       │
│       ├── nginx/
│       │   └── default.conf        # Reverse proxy: /api → python-engine:8000
│       │
│       ├── public/                 # Static assets (favicons, logos)
│       │
│       └── src/
│           ├── main.jsx            # React entry point
│           ├── App.jsx             # Root component + routing
│           │
│           ├── styles/
│           │   ├── global.css      # CSS variables, #0B0E14 base, typography
│           │   └── glassmorphism.css # Reusable glass panel classes
│           │
│           ├── components/
│           │   ├── layout/
│           │   │   ├── AppShell.jsx    # Main grid layout (sidebar + content)
│           │   │   ├── Sidebar.jsx     # Navigation sidebar
│           │   │   └── TopBar.jsx      # Top bar with global controls
│           │   │
│           │   ├── widgets/
│           │   │   ├── CoinWidget.jsx      # TradingView Lightweight Charts (Ref Bypass)
│           │   │   ├── PriceTickerBar.jsx  # Scrolling ticker strip
│           │   │   └── ScoreGauge.jsx      # Circular confidence gauge
│           │   │
│           │   ├── panels/
│           │   │   ├── AnalysisPanel.jsx   # Right-hand 8-rule breakdown
│           │   │   ├── HardRulesGate.jsx   # Red/green shield gate display
│           │   │   ├── RuleChecklist.jsx    # ✅/❌ dynamic rule checklist
│           │   │   └── AlertLogPanel.jsx   # Live alert feed
│           │   │
│           │   └── common/
│           │       ├── CircularProgress.jsx # SVG circular progress bar
│           │       ├── StatusBadge.jsx      # PASS/FAIL/REJECTED badges
│           │       └── GlassCard.jsx        # Reusable glassmorphism container
│           │
│           ├── hooks/
│           │   ├── useMarketStream.js   # WebSocket hook for live market data
│           │   ├── useConfidenceScore.js # WebSocket hook for score updates
│           │   └── useWebSocket.js       # Generic WS with exponential backoff
│           │
│           ├── stores/
│           │   ├── marketStore.js   # Zustand store for market state
│           │   └── scoreStore.js    # Zustand store for confidence scores
│           │
│           ├── services/
│           │   ├── api.js           # REST API client (fetch wrappers)
│           │   └── websocket.js     # WebSocket connection manager
│           │
│           └── utils/
│               ├── formatters.js    # Price/date/percentage formatters
│               └── constants.js     # Symbol list, color tokens, timeframes
│
├── infra/
│   ├── docker/
│   │   ├── .env.example            # Infra-specific env template
│   │   └── .env.production         # Production overrides
│   └── scripts/
│       ├── setup-host.sh           # Ubuntu 24.04 host hardening script
│       ├── deploy.sh               # One-command deploy: pull → build → up
│       └── backup-db.sh            # QuestDB snapshot to external storage
│
├── data/                           # Docker-mounted volumes (gitignored)
│   ├── questdb/
│   │   └── .gitkeep
│   └── redis/
│       └── .gitkeep
│
└── docs/                           # Architecture docs, ADRs, runbooks
```

## SOLID Principle Mapping

| Principle | Where it's enforced | Key Files |
|-----------|-------------------|-----------|
| **SRP** | Each class/module has one job | `redis_client.py` vs `telegram_notifier.py` vs `confidence_scorer.py` |
| **OCP** | Strategy Pattern for rules & indicators | `base_rule.py` → `rule_*.py`, `base_indicator.py` → `*.py` |
| **LSP** | Exchange trait is swappable | `exchange_trait.rs` → `bybit_client.rs` (add `binance_client.rs` later) |
| **ISP** | API exposes only what the UI needs | `routes.py` → `/api/widgets/score` (not raw order book data) |
| **DIP** | All connectors injected via interfaces | `message_broker.py` ← `redis_client.py` (swap to RabbitMQ later) |
