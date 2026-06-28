#!/usr/bin/env bash
# =============================================================================
# Obscura Trading Engine (Lumina Trade) — Single Script Runner
# Starts the full pipeline locally: Infra -> Ingestor -> Rust Engine -> Python Agent -> Dashboard
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
INGESTOR_DIR="$SCRIPT_DIR/services/ingestor"
RUST_ENGINE_DIR="$SCRIPT_DIR/services/engine-rust"
AGENT_DIR="$SCRIPT_DIR/services/agent-service"
DASHBOARD_DIR="$SCRIPT_DIR/services/dashboard"
AGENT_VENV="$AGENT_DIR/venv"

PIDS=()
STARTED_DOCKER_REDIS=false
STARTED_DOCKER_QUESTDB=false

cleanup() {
    echo ""
    log "Shutting down all services..."
    if [ ${#PIDS[@]} -gt 0 ]; then
        for pid in "${PIDS[@]}"; do
            kill "$pid" 2>/dev/null || true
        done
    fi
    wait 2>/dev/null || true
    
    if [ "${STARTED_DOCKER_REDIS:-false}" = true ]; then
        docker compose stop redis 2>/dev/null || true
    fi
    if [ "${STARTED_DOCKER_QUESTDB:-false}" = true ]; then
        docker compose stop questdb 2>/dev/null || true
    fi
    log "All services stopped."
}
trap cleanup EXIT INT TERM

# Helper: check if docker daemon is running
check_docker_daemon() {
    if ! docker info >/dev/null 2>&1; then
        warn "Docker daemon is not running. Attempting to start Docker automatically..."
        
        if [ -d "/Applications/OrbStack.app" ]; then
            log "Launching OrbStack..."
            open -a OrbStack
        elif [ -d "/Applications/Docker.app" ]; then
            log "Launching Docker Desktop..."
            open -a Docker
        else
            fail "Docker daemon is not running. Please start OrbStack or Docker Desktop manually."
        fi
        
        log "Waiting for Docker socket to become ready (up to 30s)..."
        local retries=0
        until docker info >/dev/null 2>&1; do
            retries=$((retries+1))
            if [ $retries -gt 30 ]; then
                fail "Docker daemon failed to start in time. Please start it manually and retry."
            fi
            sleep 1
        done
        ok "Docker daemon is online and ready."
    fi
}

# Helper: free a port by killing whatever is listening on it
free_port() {
    local port=$1
    if lsof -pi :${port} -t >/dev/null 2>&1; then
        warn "Port ${port} is in use. Stopping it..."
        kill -9 $(lsof -t -i:${port}) 2>/dev/null || true
        sleep 1
    fi
}

# ─── 1. Check Prerequisites ──────────────────────────────────────────────────
log "Checking prerequisites..."

command -v docker  >/dev/null 2>&1 || fail "Docker is required but not installed."
command -v cargo   >/dev/null 2>&1 || fail "Rust/Cargo is required but not installed."
command -v python3 >/dev/null 2>&1 || fail "Python3 is required but not installed."
command -v node    >/dev/null 2>&1 || warn "Node.js not found — dashboard will be skipped."

# Check .env
if [ ! -f ".env" ]; then
    warn ".env not found. Copying from .env.example..."
    cp .env.example .env
    warn "Please edit .env to configure your TELEGRAM_BOT_TOKEN and GEMINI_API_KEY."
fi

ok "Prerequisites met."

# Load environment variables (prefer .env.production if it exists, fallback to .env)
ENV_FILE=".env"
if [ -f ".env.production" ]; then
    ENV_FILE=".env.production"
fi

if [ -f "$ENV_FILE" ]; then
    log "Loading environment variables from $ENV_FILE..."
    set -a
    source "$ENV_FILE"
    set +a
fi

# ─── 2. Infrastructure (Redis + QuestDB) ─────────────────────────────────────
log "Checking Redis..."
if python3 -c "import socket; s=socket.socket(); s.settimeout(2); s.connect(('localhost',6379)); s.send(b'PING\r\n'); print(s.recv(1024).decode())" 2>/dev/null | grep -q PONG; then
    ok "Redis already running on localhost:6379 — reusing."
else
    log "Starting Redis container..."
    check_docker_daemon
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d redis 2>&1 | tail -1
    STARTED_DOCKER_REDIS=true
    log "Waiting for Redis..."
    until python3 -c "import socket; s=socket.socket(); s.settimeout(2); s.connect(('localhost',6379)); s.send(b'PING\r\n'); print(s.recv(1024).decode())" 2>/dev/null | grep -q PONG; do
        sleep 1
    done
    ok "Redis is ready."
fi

log "Checking QuestDB..."
if curl -sf "http://localhost:9000/exec?query=SELECT%201" >/dev/null 2>&1; then
    ok "QuestDB already running on localhost:9000 — reusing."
else
    log "Starting QuestDB container..."
    check_docker_daemon
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d questdb 2>&1 | tail -1
    STARTED_DOCKER_QUESTDB=true
    log "Waiting for QuestDB..."
    until curl -sf "http://localhost:9000/exec?query=SELECT%201" >/dev/null 2>&1; do
        sleep 1
    done
    ok "QuestDB is ready."
fi

# Initialize QuestDB schema
log "Initializing QuestDB schema..."
curl -sG http://localhost:9000/exec --data-urlencode "query@infra/scripts/init-questdb.sql" >/dev/null 2>&1
ok "QuestDB schema ready."

# ─── 3. Setup Python Agent Service ──────────────────────────────────────────
log "Setting up Python Agent Service..."
cd "$AGENT_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
./venv/bin/pip install -q -r requirements.txt 2>&1 | tail -1
cd "$SCRIPT_DIR"
ok "Python Agent dependencies configured."

# ─── 4. Setup Dashboard ──────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
    log "Setting up Dashboard..."
    cd "$DASHBOARD_DIR"
    if [ ! -d "node_modules" ]; then
        npm install --silent 2>&1 | tail -1
    fi
    cd "$SCRIPT_DIR"
    ok "Dashboard ready."
else
    warn "Skipping dashboard setup (Node.js not found)."
fi

# ─── 5. Start Services ───────────────────────────────────────────────────────
echo ""
log "══════════════════════════════════════════════════════════════════"
log "  Starting Lumina Trade Microservices (Local Mode)"
log "══════════════════════════════════════════════════════════════════"
echo ""

# Free ports to avoid bind issues
free_port 8000
free_port 8001
free_port 3000

# 5a. Start Rust Ingestor
log "Starting Rust Ingestor..."
cd "$INGESTOR_DIR"
REDIS_URL=redis://localhost:6379 QUESTDB_ILP_HOST=localhost cargo run --release &
PIDS+=($!)
cd "$SCRIPT_DIR"
sleep 2
ok "Rust Ingestor started (PID ${PIDS[${#PIDS[@]}-1]})."

# 5b. Start Rust Engine (port 8000)
log "Starting Rust Engine..."
cd "$RUST_ENGINE_DIR"
REDIS_URL=redis://localhost:6379 cargo run --release &
PIDS+=($!)
cd "$SCRIPT_DIR"
sleep 3

# Simple health check loop for Rust engine
log "Checking Rust Engine status..."
until curl -sf http://localhost:8000/api/history/BTCUSDT?interval=5 >/dev/null 2>&1; do
    sleep 1
done
ok "Rust Engine listening on http://localhost:8000 (PID ${PIDS[${#PIDS[@]}-1]})."

# 5c. Start Python Agent Service (port 8001)
log "Starting Python Agent Service..."
cd "$AGENT_DIR"
# Inject env parameters to connect to localhost APIs
REDIS_URL=redis://localhost:6379 DB_PATH=data/lumina_trade.db RUST_ENGINE_URL=http://localhost:8000 AGENT_API_PORT=8001 ./venv/bin/python main.py &
PIDS+=($!)
cd "$SCRIPT_DIR"
sleep 3
ok "Python Agent listening on http://localhost:8001 (PID ${PIDS[${#PIDS[@]}-1]})."

# 5d. Start React Dashboard (port 3000)
if command -v node >/dev/null 2>&1; then
    log "Starting React Dashboard dev server..."
    cd "$DASHBOARD_DIR"
    npm run dev -- --host 0.0.0.0 &
    PIDS+=($!)
    cd "$SCRIPT_DIR"
    sleep 2
    ok "Dashboard running at http://localhost:3000"
fi

# ─── 6. Output Status ────────────────────────────────────────────────────────
echo ""
log "══════════════════════════════════════════════════════════════════"
log "  All Lumina Trade services running successfully!"
log ""
log "  React Dashboard:  http://localhost:3000"
log "  Rust Engine API:  http://localhost:8000/docs"
log "  Python Agent API: http://localhost:8001"
log "  QuestDB Console:  http://localhost:9000"
log ""
log "  Press [Ctrl + C] to safely shut down all services."
log "══════════════════════════════════════════════════════════════════"
echo ""

# Wait for background jobs to exit (Ctrl+C will trigger trap cleanup)
wait
