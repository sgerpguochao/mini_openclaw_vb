#!/bin/bash
# Start OpenClaw gateway on 0.0.0.0 for external client access.
# Logs are saved to logs_/gateway-YYYYMMDD-HHMMSS.log

set -e
cd "$(dirname "$0")"

# Load nvm if available
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
  nvm use 22 2>/dev/null || true
fi

PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
export OPENCLAW_SKIP_CHANNELS="${OPENCLAW_SKIP_CHANNELS:-1}"
export CLAWDBOT_SKIP_CHANNELS="${CLAWDBOT_SKIP_CHANNELS:-1}"

LOG_DIR="logs_"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/gateway-$(date +%Y%m%d-%H%M%S).log"

echo "Starting OpenClaw gateway on 0.0.0.0:${PORT} (bind=lan)..."
echo "Log file: $LOG_FILE"
nohup node openclaw.mjs gateway run --bind lan --port "$PORT" --verbose >> "$LOG_FILE" 2>&1 &
echo "Gateway started (PID: $!). Logs: $LOG_FILE"
