#!/bin/bash
# Start OpenClaw gateway on 0.0.0.0 for external client access.
# Usage: ./scripts/start-gateway-lan.sh [--port 18789]

set -e
cd "$(dirname "$0")/.."

# Load nvm if available
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
  nvm use 22 2>/dev/null || true
fi

PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
export OPENCLAW_SKIP_CHANNELS="${OPENCLAW_SKIP_CHANNELS:-1}"
export CLAWDBOT_SKIP_CHANNELS="${CLAWDBOT_SKIP_CHANNELS:-1}"

echo "Starting OpenClaw gateway on 0.0.0.0:${PORT} (bind=lan)..."
exec node openclaw.mjs gateway run --bind lan --port "$PORT" --verbose
