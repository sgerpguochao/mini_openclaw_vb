#!/bin/bash
# Stop OpenClaw gateway.
# Logs from previous runs are in logs_/

cd "$(dirname "$0")"

PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
killed=0

# Try pkill first (matches gateway processes - actual name is "openclaw-gateway")
for pattern in "openclaw-gateway" "openclaw.mjs gateway" "openclaw gateway run" "run-node.mjs gateway"; do
  if pkill -f "$pattern" 2>/dev/null; then
    killed=1
  fi
done

# Fallback: kill process listening on the gateway port
if [ "$killed" -eq 0 ]; then
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null && killed=1
  elif command -v lsof >/dev/null 2>&1; then
    pid=$(lsof -ti :"${PORT}" 2>/dev/null | head -1)
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null && killed=1
    fi
  fi
fi

if [ "$killed" -eq 1 ]; then
  echo "OpenClaw gateway stopped."
else
  echo "No running OpenClaw gateway found (port ${PORT})."
fi

if [ -d "logs_" ]; then
  echo "Logs: $(pwd)/logs_/"
fi
