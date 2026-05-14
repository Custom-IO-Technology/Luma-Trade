# 🌑 Obscura Trading Engine (Lumina Trade)

> A fault-tolerant, low-latency, and highly extensible crypto trading engine built with Rust, Python, and React.

Obscura is designed around strict SOLID principles to ensure it is "Open for extension, but Closed for modification". It features a robust multi-service architecture communicating via an Event-Driven pipeline (Redis Streams), ensuring that data ingestion, indicator processing, trading logic, and UI rendering are entirely decoupled.

---

## 🏗 Architecture Overview

1. **Rust Ingestor ("The Shield"):** Sub-millisecond WebSocket ingestion from exchanges (Bybit), handling exponential backoff, and publishing to a Redis stream.
2. **QuestDB ("Cold Storage"):** Ultra-fast columnar time-series database handling all historical candle data via InfluxDB Line Protocol (ILP).
3. **Python Engine ("The Brain"):** A vectorized logic engine built on Polars. Computes 6 technical indicators and loops through an 8-rule Strategy Pattern checking hard/soft constraints to generate a final Confidence Score.
4. **React Dashboard ("The Glass"):** A sleek, glassmorphism-styled dark UI using TradingView's canvas engine to render high-frequency live ticks via WebSockets without DOM thrashing.

---

## 🚀 Quick Start (Development)

### Prerequisites
- Docker & Docker Compose
- Node.js (if running the UI locally outside Docker)
- Rust & Cargo (if running the Ingestor locally)
- Python 3.11 (if running the Engine locally)

### 1. Configure Environment
```bash
cp .env.example .env.production
```
*Edit `.env.production` to include your Telegram bot tokens and any specific Bybit configuration.*

### 2. Start Infrastructure Services
For development, start Redis and QuestDB first:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d redis questdb
```

*Initialize the QuestDB Schema:*
```bash
curl -G http://localhost:9000/exec --data-urlencode "query@infra/scripts/init-questdb.sql"
```

### 3. Start Microservices
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up rust-ingestor python-engine dashboard
```

- **Dashboard:** [http://localhost:3000](http://localhost:3000)
- **QuestDB Console:** [http://localhost:9000](http://localhost:9000)
- **FastAPI Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📖 SOLID Design & Extensibility

Obscura is designed so that adding new features requires **zero modification to core files**.

- **Adding a new Exchange:** Create a new file implementing the `ExchangeClient` trait in `services/ingestor/src/exchange_trait.rs`. (Liskov Substitution Principle).
- **Adding a new Indicator:** Create a new file in `services/engine/indicators/` inheriting from `AbstractIndicator`. The engine will auto-discover it. (Open/Closed Principle).
- **Adding an AI Trading Rule:** Create a new file in `services/engine/rules_engine/` inheriting from `AbstractRule`. The `ConfidenceScorer` will automatically pick it up and include it in the scoring payload.

Please refer to the following documents in the root directory for a comprehensive breakdown:
- [`folder_structure.md`](./folder_structure.md) - Exact mapping of every file to its architectural purpose and SOLID principle.
- [`implementation_tasks.md`](./implementation_tasks.md) - The complete 42-task implementation roadmap broken down into 6 phases.

---

## 🛡 Production Deployment

We use a heavily optimized multi-stage Docker strategy and a customized Ubuntu 24.04 environment to run reliably on resource-constrained hardware (e.g. 16GB edge servers).

1. **Host Setup:**
   ```bash
   sudo bash infra/scripts/setup-host.sh
   ```
2. **Deploy:**
   ```bash
   bash infra/scripts/deploy.sh
   ```

## 🔒 Security
- **Never commit `.env.production`.**
- Docker containers run as non-root.
- Exposed ports are strictly limited to `80` (UI) and `9000` (QuestDB Console). Redis and FastAPI are restricted to the internal Docker bridge network (`trading_net`).
