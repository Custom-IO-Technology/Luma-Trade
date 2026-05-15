#!/usr/bin/env bash
# =============================================================================
# Obscura Trading Engine — Single Script Runner
# Starts the full pipeline: Infrastructure → Ingestor → Engine → Dashboard
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $1"; }
warn() { echo -e "${YELLOW}[ WAIT ]${NC} $1"; }
fail() { echo -e "${RED}[ FAIL ]${NC} $1"; exit 1; }

# ─── Config ──────────────────────────────────────────────────────────────────
VENV_DIR="$SCRIPT_DIR/services/engine/venv"
INGESTOR_DIR="$SCRIPT_DIR/services/ingestor"
ENGINE_DIR="$SCRIPT_DIR/services/engine"
DASHBOARD_DIR="$SCRIPT_DIR/services/dashboard"
INGESTOR_BIN="$INGESTOR_DIR/target/release/obscura-ingestor"

PIDS=()
STARTED_DOCKER_REDIS=false
STARTED_DOCKER_QUESTDB=false

cleanup() {
    log "Shutting down all services..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
    if [ "$STARTED_DOCKER_REDIS" = true ]; then
        docker compose -f docker-compose.yml -f docker-compose.dev.yml stop redis 2>/dev/null || true
    fi
    if [ "$STARTED_DOCKER_QUESTDB" = true ]; then
        docker compose -f docker-compose.yml -f docker-compose.dev.yml stop questdb 2>/dev/null || true
    fi
    log "All services stopped."
}
trap cleanup EXIT INT TERM

# Helper: free a port by killing whatever is listening on it
free_port() {
    local port=$1
    if fuser "${port}/tcp" >/dev/null 2>&1; then
        warn "Port ${port} is in use. Stopping it..."
        fuser -k "${port}/tcp" 2>/dev/null || true
        sleep 1
    fi
}

# ─── 1. Check Prerequisites ──────────────────────────────────────────────────
log "Checking prerequisites..."

command -v docker  >/dev/null 2>&1 || fail "Docker is required but not installed."
command -v cargo   >/dev/null 2>&1 || fail "Rust/Cargo is required but not installed."
command -v python3 >/dev/null 2>&1 || fail "Python3 is required but not installed."
command -v node    >/dev/null 2>&1 || warn "Node.js not found — dashboard will be skipped."

# Check .env exists
if [ ! -f ".env" ]; then
    warn ".env not found. Copying from .env.example..."
    cp .env.example .env
    warn "Edit .env with your TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID if needed."
fi

ok "Prerequisites met."

# ─── 2. Infrastructure (Redis + QuestDB) ─────────────────────────────────────

# Check if Redis is already reachable (e.g. from another project)
log "Checking Redis..."
if python3 -c "import socket; s=socket.socket(); s.settimeout(2); s.connect(('localhost',6379)); s.send(b'PING\r\n'); print(s.recv(1024).decode())" 2>/dev/null | grep -q PONG; then
    ok "Redis already running on localhost:6379 — reusing."
else
    log "Starting Redis container..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d redis 2>&1 | tail -1
    STARTED_DOCKER_REDIS=true
    log "Waiting for Redis..."
    until python3 -c "import socket; s=socket.socket(); s.settimeout(2); s.connect(('localhost',6379)); s.send(b'PING\r\n'); print(s.recv(1024).decode())" 2>/dev/null | grep -q PONG; do
        sleep 1
    done
    ok "Redis is ready."
fi

# Check if QuestDB is already reachable
log "Checking QuestDB..."
if curl -sf "http://localhost:9000/exec?query=SELECT%201" >/dev/null 2>&1; then
    ok "QuestDB already running on localhost:9000 — reusing."
else
    log "Starting QuestDB container..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d questdb 2>&1 | tail -1
    STARTED_DOCKER_QUESTDB=true
    log "Waiting for QuestDB..."
    until curl -sf "http://localhost:9000/exec?query=SELECT%201" >/dev/null 2>&1; do
        sleep 1
    done
    ok "QuestDB is ready."
fi

# Initialize QuestDB schema (idempotent CREATE IF NOT EXISTS)
log "Initializing QuestDB schema..."
curl -sG http://localhost:9000/exec --data-urlencode "query@infra/scripts/init-questdb.sql" >/dev/null 2>&1
ok "QuestDB schema ready."

# ─── 3. Build Rust Ingestor ──────────────────────────────────────────────────
log "Building Rust Ingestor..."
cd "$INGESTOR_DIR"
cargo build --release 2>&1 | tail -3
cd "$SCRIPT_DIR"
ok "Rust Ingestor built."

# ─── 4. Setup Python Engine ──────────────────────────────────────────────────
log "Setting up Python Engine..."
cd "$ENGINE_DIR"
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv venv
fi
"$VENV_DIR/bin/pip" install -q -r requirements.txt 2>&1 | tail -1
cd "$SCRIPT_DIR"
ok "Python Engine ready."

# ─── 5. Setup Dashboard ──────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
    log "Setting up Dashboard..."
    cd "$DASHBOARD_DIR"
    if [ ! -d "node_modules" ]; then
        npm install --silent 2>&1 | tail -1
    fi
    cd "$SCRIPT_DIR"
    ok "Dashboard ready."
else
    warn "Skipping dashboard (Node.js not found)."
fi

# ─── 6. Start Services ───────────────────────────────────────────────────────
echo ""
log "══════════════════════════════════════════════════════════════════"
log "  Starting Obscura Trading Engine (Hard Boundary Mode)"
log "══════════════════════════════════════════════════════════════════"
echo ""

# Free ports if something is already listening (stale previous runs)
free_port 8000
free_port 3000

# 6a. Rust Ingestor (background)
log "Starting Rust Ingestor..."
cd "$INGESTOR_DIR"
RUST_LOG=info cargo run --release &
PIDS+=($!)
cd "$SCRIPT_DIR"

# Give ingestor a moment for cold start
sleep 3
ok "Rust Ingestor running (PID ${PIDS[-1]})"

# 6b. Python Engine (background)
log "Starting Python Math Engine..."
cd "$ENGINE_DIR"
"$VENV_DIR/bin/python" -m api.fastapi_app &
PIDS+=($!)
cd "$SCRIPT_DIR"

sleep 2
if curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
    ok "Python Engine running on http://localhost:8000 (PID ${PIDS[-1]})"
else
    fail "Python Engine failed to start."
fi

# 6c. Dashboard (background, optional)
if command -v node >/dev/null 2>&1; then
    log "Starting Dashboard dev server..."
    cd "$DASHBOARD_DIR"
    npm run dev -- --host 0.0.0.0 &
    PIDS+=($!)
    cd "$SCRIPT_DIR"
    sleep 3
    ok "Dashboard running on http://localhost:3000"
fi

# ─── 7. Status Summary ───────────────────────────────────────────────────────
echo ""
log "══════════════════════════════════════════════════════════════════"
log "  All services running!"
log ""
log "  Dashboard:   http://localhost:3000"
log "  Engine API:  http://localhost:8000/docs"
log "  QuestDB:     http://localhost:9000"
log ""
log "  Press Ctrl+C to stop all services."
log "══════════════════════════════════════════════════════════════════"
echo ""

# ─── 8. Wait for shutdown ───────────────────────────────────────────────────
wait
