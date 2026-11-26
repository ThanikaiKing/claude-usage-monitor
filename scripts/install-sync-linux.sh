#!/usr/bin/env bash
# Installs (or updates) the daily sync as a systemd user timer.
#   scripts/install-sync-linux.sh            # daily at 10:00
#   scripts/install-sync-linux.sh 21:00      # another time
#   systemctl --user start claude-usage-sync.service         # run now
#   systemctl --user disable --now claude-usage-sync.timer   # remove
# Persistent=true runs a missed sync as soon as the machine is back on or awake.
set -euo pipefail
AT="${1:-10:00}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$(command -v node)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$UNIT_DIR"
chmod +x "$REPO/scripts/daily-sync.sh" "$REPO/scripts/hook-ingest.sh"

cat > "$UNIT_DIR/claude-usage-sync.service" <<EOF
[Unit]
Description=Ingest Claude Code usage and push data/usage.json so Vercel redeploys

[Service]
Type=oneshot
Environment=NODE=$NODE
Environment=PATH=$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin
ExecStart=$REPO/scripts/daily-sync.sh
TimeoutStartSec=10min
EOF

cat > "$UNIT_DIR/claude-usage-sync.timer" <<EOF
[Unit]
Description=Daily Claude Code usage sync

[Timer]
OnCalendar=*-*-* $AT:00
Persistent=true
# Catch up shortly after login/boot too; daily-sync.sh is a no-op once it has synced today.
OnStartupSec=2min

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now claude-usage-sync.timer
systemctl --user list-timers claude-usage-sync.timer --no-pager
