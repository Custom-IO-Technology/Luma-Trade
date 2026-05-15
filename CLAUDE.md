# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

Obscura is a crypto trading engine with a strict **Hard Boundary** enforced by Redis Sorted Sets. The rule: Rust does all networking (left of Redis), Python does all math (right of Redis). They never cross — Redis ZSETs are the only bridge.

```
┌─────────────────────────────────────────────────────────────────────┐
│  LEFT OF REDIS                    │  RIGHT OF REDIS                 │
│  (Rust Ingestor)                  │  (Python Engine)                │
│                                   │                                 │
│  Bybit REST ──► cold start ──►    │    ◄── Redis ZRANGE ── REST API │
│  Bybit WS   ──► live ticks ──►    │    ◄── Polars aggregate        │
│                    │              │    ◄── 6 indicators             │
│                    ▼              │    ◄── 8-rule scorer            │
│              Redis ZSET           │    ◄── WebSocket push           │
│              QuestDB              │                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Details

**Rust Ingestor** (`services/ingestor/`) — The Network Shield
- On startup, runs a **cold start**: fetches 30 days of 5m candles from Bybit REST for each symbol, writes batch ILP to QuestDB, batch ZADD to Redis ZSET. Skips symbols that already have data (checks `zcount > 0` — see gotcha below).
- Then enters a **live loop**: subscribes to Bybit WebSocket for 5m klines. Every tick (confirm=false and confirm=true) gets written to Redis ZSET via `ZADD` (overwriting same-timestamp unconfirmed candles). Confirmed candles also go to QuestDB.
- Zero math. Zero indicators. Just pipes data.
- Key files: `src/main.rs` (orchestration), `src/bybit_rest.rs` (REST client), `src/bybit_client.rs` (WS client), `src/redis_publisher.rs` (ZSET operations), `src/questdb_writer.rs` (ILP writes)

**Redis ZSET** — The Boundary
- Keys: `market:kline:5m:{SYMBOL}` (e.g., `market:kline:5m:BTCUSDT`)
- Score: `timestamp` in milliseconds (u64)
- Member: JSON-serialized `KlineMessage` — `{symbol, open, high, low, close, volume, timestamp, confirm}`
- Capped at 8640 members (30 days of 5m candles). Trim is done via `ZREMRANGEBYRANK` on every write.
- Unconfirmed ticks (confirm=false) overwrite the same timestamp via `ZREMRANGEBYSCORE` + `ZADD`, so the ZSET always has the latest price for the current candle.

**Python Engine** (`services/engine/`) — The Math Engine
- Single entry point: `python -m api.fastapi_app` (port 8000)
- Reads 5m candles from Redis ZSET via `ZRANGE`, then aggregates to the user-requested timeframe using Polars `group_by_dynamic` (see `core/aggregator.py`).
- Computes 6 indicators (auto-discovered from `indicators/`), runs 8 rules through `ConfidenceScorer` (auto-discovered from `rules_engine/`).
- Three API surfaces (all in `api/routes.py`):
  1. `GET /api/history/{symbol}?interval=60` — returns OHLCV array for chart
  2. `GET /api/widgets/score/{symbol}?interval=60&direction=LONG` — returns confidence score + rules breakdown
  3. `WS /api/ws/stream/{symbol}?interval=60` — pushes `kline_update` (every tick) and `score_update` (throttled)
- Zero Bybit networking. `bybit_connector.py` raises `ImportError` if imported.
- `backend.py` is a deprecated redirect that imports from `api.fastapi_app`.

**React Dashboard** (`services/dashboard/`) — Vite + React 18, port 3000
- Vite proxies `/api` to `http://localhost:8000` with `ws: true` for WebSocket upgrade.
- Three Zustand stores: `marketStore` (price data + tickVersion counter), `scoreStore` (confidence scores), `botStore` (Telegram alert toggle).
- The critical component is `CoinWidget.jsx` (see Frontend Architecture below).

## Data Flow in Detail

### Cold Start (once per ingestor restart)
```
Bybit REST API (GET /v5/market/kline)
  → BybitRestClient::fetch_30_days() — paginates 200-candle batches, deduplicates
  → QuestDbWriter::write_batch() — multi-line ILP over TCP
  → RedisPublisher::zadd_batch() — pipeline ZADD + ZREMRANGEBYRANK trim
```

### Live Stream (continuous)
```
Bybit WS (kline.5.{SYMBOL})
  → BybitClient::next_message() → KlineMessage { symbol, OHLCV, timestamp, confirm }
  → RedisPublisher::zadd_candle() — ZREMRANGEBYSCORE (dedup ts) → ZADD → ZREMRANGEBYRANK (trim to 8640)
  → QuestDbWriter::write() — only if confirm == true
```

### API Request (on-demand from dashboard)
```
Dashboard fetch("/api/history/BTCUSDT?interval=60")
  → Vite proxy → Python :8000
  → RedisClient.zrange("market:kline:5m:BTCUSDT", 0, -1)
  → json.loads each member → List[Dict]
  → aggregate_candles(candles, "60") — Polars group_by_dynamic: 5m → 1h OHLCV
  → to_dicts() → JSON response
```

### WebSocket Stream (persistent connection per coin widget)
```
Dashboard new WebSocket("ws://localhost:3000/api/ws/stream/BTCUSDT?interval=60")
  → Vite proxy (ws: true) → Python :8000
  → Loop: ZRANGE last member every 200ms
    → On change: re-read all, aggregate, push kline_update (FAST PATH)
    → Every 2s or on confirm=true: compute indicators + score, push score_update (SLOW PATH)
```

## Frontend Architecture (Critical Patterns)

### CoinWidget.jsx — Direct Canvas Writes (DO NOT BREAK THIS)

`CoinWidget` manages its **own WebSocket** internally. On every `ws.onmessage`:
- **kline_update messages**: written DIRECTLY to the lightweight-charts canvas via `candleSeriesRef.current.update(msg.data)`. This bypasses React entirely — no state, no re-render, no useEffect. This is what creates the "TradingView effect" where the last candle morphs in real-time.
- **score_update messages**: written to Zustand `scoreStore` via `setScore()` — these drive the UI badges and rule checklist, not the chart.

The store is updated for UI elements only (price display, connection status dot) via `addTick()`, but the chart NEVER reads from the store for rendering. The chart only uses `setData()` once on mount (for history), then `update()` directly from WebSocket for live ticks.

DO NOT:
- Put live tick data into React state or Zustand for chart rendering
- Use useEffect dependencies to trigger chart updates from store changes
- Create a separate WebSocket hook for CoinWidget — it owns its connection

### Zustand Stores

- `marketStore`: `symbols` (price data per coin), `tickVersion` (primitive counter — always increments, always triggers re-renders), `timeframe`. The `addTick()` action handles same-timestamp overwrite (unclosed candle), new-timestamp append, and out-of-order rejection.
- `scoreStore`: `scores` per symbol. Score data arrives on a 2s throttle from the WebSocket, not on every tick.
- `botStore`: Telegram bot enabled state, persisted to localStorage.

### CoinCard.jsx

Thin wrapper around CoinWidget. Shows header (symbol, PASS/WATCHING badge, remove button), the CoinWidget chart (260px height), and an info footer (WS status dot, live price, score %, rules passed count). Does NOT manage WebSocket — delegates entirely to CoinWidget.

## Python Engine Internals

### WebSocket — Unclosed Candle Architecture

The WebSocket endpoint uses a poll loop (not a Redis pub/sub subscription) to decouple price from math:

- **200ms poll**: Read the last ZSET member. If changed → re-read all candles, aggregate, push `kline_update` immediately. This is cheap (Polars on <10k rows is microseconds).
- **2s throttle OR confirm=true**: Full math path — compute all 6 indicators, run all 8 rules, push `score_update`. This keeps the i5 CPU safe by not recomputing heavy Polars operations on every tick.

### Aggregation (`core/aggregator.py`)

`aggregate_candles(candles, timeframe)` converts 5m candles to any timeframe:
- `"5"` → passthrough (no aggregation, just type casting)
- `"1"`, `"15"`, `"60"`, `"240"`, `"1440"` → `group_by_dynamic` with OHLCV resampling (first open, max high, min low, last close, sum volume)
- Input timestamps are ms (from Bybit), internally converted to datetime for Polars, output is Unix seconds (int) for lightweight-charts

### Auto-Discovery

Both `indicators/` and `rules_engine/` use `importlib` to scan their directories. Adding a new file with an `AbstractIndicator` or `AbstractRule` subclass is sufficient — no manual registration needed.

### Scoring Tiers

- Score ≥ 90 → `PASS` → "🟢 A - PRIME SETUP" (full size)
- Score ≥ 70 → `PASS` → "🟡 B - GOOD SETUP" (scaled size)
- Score < 70 → `PASS` → "🟠 C - WEAK SETUP" (reduced size)
- Hard rule failure → `REJECTED` → "🔴 NO TRADE"
- Insufficient data (<20 candles) → `WAITING`

## Commands

### Infrastructure
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d redis questdb
curl -G http://localhost:9000/exec --data-urlencode "query@infra/scripts/init-questdb.sql"
bash infra/scripts/deploy.sh
```

### Dashboard (`services/dashboard/`)
```bash
npm run dev       # :3000, proxies /api → localhost:8000 (ws: true)
npm run build
npm run lint
```

### Engine (`services/engine/`)
```bash
python -m api.fastapi_app    # Single entry point, port 8000, Swagger at /docs
pip install -r requirements.txt
```

### Ingestor (`services/ingestor/`)
```bash
# Must source .env first — dotenvy reads from working directory
cd services/ingestor && RUST_LOG=info cargo run --release
cargo build --release
```

### Ports (dev mode)
| Port | Service | Notes |
|------|---------|-------|
| 3000 | Dashboard | Vite dev server |
| 8000 | Python Engine | FastAPI + Swagger at /docs |
| 6379 | Redis | ZSET bridge + Streams |
| 9000 | QuestDB | Web console |
| 9009 | QuestDB | ILP ingest |
| 8812 | QuestDB | PG wire protocol |

## Gotchas & Pitfalls

1. **Ingestor cold start skip bug**: The cold start skips a symbol if `zcount > 0`. If the ingestor is running and you manually delete a Redis key, a live tick can write 1 candle before the cold start loop reaches that symbol — causing it to skip with count=1. Fix: `pkill obscura-ingestor` FIRST, then delete the Redis key, then restart.

2. **Polars datetime cast**: `pl.col("time").cast(pl.Int64)` on a Polars datetime column yields **microseconds**, not nanoseconds. Divide by `1_000_000` to get Unix seconds (not `1_000_000_000`).

3. **lightweight-charts update() behavior**: `series.update({time, open, high, low, close})` with the SAME `time` value as the last candle → morphs the candle in-place (the TradingView effect). A NEW `time` value → draws a new candle and shifts the chart left. This is how unclosed candles animate.

4. **Zustand Object.is**: Primitive values (numbers, strings) always trigger re-renders when changed. Object references may not (same reference = no re-render). The `tickVersion` counter in marketStore exists specifically to guarantee re-renders on every tick.

5. **CoinWidget owns its WebSocket**: Each CoinWidget instance opens its own WebSocket. The connection URL encodes symbol and interval. On symbol/timeframe change, the cleanup function closes the old socket and a new one opens (exponential backoff: 1s → 30s max).

6. **Vite proxy ws:true**: Without `ws: true` in vite.config.js, WebSocket upgrade requests to `/api/ws/...` fail. The proxy must be the first hop for WS connections from the browser.

7. **Redis ZSET members are JSON strings**: When reading from ZSET, always `json.loads()` each member. When writing, `json.dumps()` the dict. The score field is the timestamp in ms.

8. **Engine requires `python -m api.fastapi_app`**: Not `python api/fastapi_app.py`. The `-m` flag is required for the `api.` package prefix to resolve internal imports like `from core.config import settings`.

9. **QuestDB uses SYMBOL type**: Not `STRING` or `VARCHAR`. The `SYMBOL` type in QuestDB is for low-cardinality string data like ticker names.

10. **Symbol normalization**: `SOLANA` → `SOLUSDT`, bare symbols get `USDT` appended. Handled by `_normalize_symbol()` in routes.py.
