#!/usr/bin/env bash
# =============================================================================
# Obscura Trading Engine — Host Preparation Script
# Target: Ubuntu Server 24.04 LTS (Headless)
# Usage: sudo bash setup-host.sh
# =============================================================================
set -euo pipefail

echo "═══════════════════════════════════════════════════"
echo " Obscura Engine — Host Setup"
echo "═══════════════════════════════════════════════════"

# --- 1. System Update ---
echo "[1/7] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# --- 2. CPU Governor → Performance ---
echo "[2/7] Setting CPU governor to 'performance'..."
apt-get install -y -qq cpufrequtils
echo 'GOVERNOR="performance"' > /etc/default/cpufrequtils
systemctl restart cpufrequtils 2>/dev/null || true
# Also set immediately for all cores
for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
    echo "performance" > "$cpu" 2>/dev/null || true
done

# --- 3. I/O Scheduler → mq-deadline ---
echo "[3/7] Setting I/O scheduler to 'mq-deadline'..."
for disk in /sys/block/sd*/queue/scheduler; do
    echo "mq-deadline" > "$disk" 2>/dev/null || true
done
# Persist via udev rule
cat > /etc/udev/rules.d/60-scheduler.rules << 'EOF'
ACTION=="add|change", KERNEL=="sd*[!0-9]", ATTR{queue/scheduler}="mq-deadline"
EOF

# --- 4. Disable Swap ---
echo "[4/7] Disabling swap..."
swapoff -a
sed -i '/ swap / s/^/#/' /etc/fstab

# --- 5. Install Docker ---
echo "[5/7] Installing Docker Engine + Compose..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
else
    echo "  Docker already installed, skipping."
fi

# --- 6. Firewall (UFW) ---
echo "[6/7] Configuring firewall..."
apt-get install -y -qq ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment "SSH"
ufw allow 80/tcp    comment "Dashboard UI"
ufw allow 9000/tcp  comment "QuestDB Web UI"
ufw --force enable

# --- 7. Kernel Tuning ---
echo "[7/7] Applying kernel network tunings..."
cat >> /etc/sysctl.conf << 'EOF'

# Obscura Trading Engine — Network Tuning
net.core.somaxconn = 1024
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
vm.overcommit_memory = 1
EOF
sysctl -p

echo ""
echo "═══════════════════════════════════════════════════"
echo " ✅ Host setup complete. Reboot recommended."
echo "═══════════════════════════════════════════════════"
