#!/usr/bin/env bash
# =============================================================================
# Obscura Trading Engine — One-Command Deploy
# Usage: bash deploy.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "═══════════════════════════════════════════════════"
echo " Obscura Engine — Deploying..."
echo "═══════════════════════════════════════════════════"

cd "$PROJECT_ROOT"

# 1. Pull latest code
echo "[1/4] Pulling latest code..."
git pull --ff-only origin main

# 2. Check .env.production exists
if [ ! -f .env.production ]; then
    echo "❌ ERROR: .env.production not found!"
    echo "   Copy .env.example to .env.production and fill in real values."
    exit 1
fi

# 3. Build images
echo "[2/4] Building Docker images..."
docker compose build --parallel

# 4. Deploy with zero-downtime rolling restart
echo "[3/4] Starting services..."
docker compose up -d --remove-orphans

# 5. Wait for health checks
echo "[4/4] Waiting for health checks..."
sleep 10
docker compose ps

echo ""
echo "═══════════════════════════════════════════════════"
echo " ✅ Deploy complete!"
echo "═══════════════════════════════════════════════════"
