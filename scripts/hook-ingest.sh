#!/usr/bin/env bash
# Claude Code SessionEnd hook (Linux/macOS): refresh data/usage.json locally. Never commits or pushes.
# Registered in ~/.claude/settings.json as an async hook, so it doesn't delay session exit.
cat > /dev/null   # hook payload on stdin; not needed

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO/logs"
LOG="$LOG_DIR/ingest.log"
mkdir -p "$LOG_DIR"
NODE="${NODE:-$(command -v node || echo /home/linuxbrew/.linuxbrew/bin/node)}"

(
  # Wait for a running daily sync rather than ingest mid-reset.
  flock -w 300 9 || { echo "$(date +%Y-%m-%dT%H:%M:%S) [hook] skip: lock busy" >> "$LOG"; exit 0; }
  cd "$REPO" || exit 0
  if out="$("$NODE" node_modules/tsx/dist/cli.mjs scripts/ingest.ts 2>&1)"; then status=ok; else status="failed ($?)"; fi
  echo "$(date +%Y-%m-%dT%H:%M:%S) [hook] $status $(echo "$out" | grep -v -i -e deprecat -e trace-deprecation)" >> "$LOG"
) 9> "$LOG_DIR/.lock"

if [ "$(wc -l < "$LOG")" -gt 500 ]; then tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
exit 0
