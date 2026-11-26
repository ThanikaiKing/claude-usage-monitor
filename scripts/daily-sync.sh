#!/usr/bin/env bash
# Daily sync (Linux/macOS): ingest, commit data/usage.json if it changed, and push so Vercel redeploys.
# Run by the claude-usage-sync systemd user timer (see install-sync-linux.sh).
# Safety rules (same as daily-sync.ps1):
#   - only ever commits data/usage.json (other local edits are left untouched)
#   - only pushes when every unpushed commit is a snapshot-only commit
#   - only runs on the main branch
# Several machines push to the same repo, so each run first moves onto origin/main, then
# ingests on top of it (ingest merges, so other machines' data is kept). If another machine
# pushed in between, the push is rejected and the whole cycle is retried.
# A run that already succeeded today makes later runs that day a no-op. Pass --force to sync anyway.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO/logs"
LOG="$LOG_DIR/sync.log"
STAMP="$LOG_DIR/last-sync.txt"
mkdir -p "$LOG_DIR"
log() { echo "$(date +%Y-%m-%dT%H:%M:%S) $*" >> "$LOG"; }
trim_log() { [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 500 ] && { tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }; return 0; }
trap trim_log EXIT

TODAY="$(date +%Y-%m-%d)"
if [ "${1:-}" != "--force" ] && [ -f "$STAMP" ] && [ "$(tr -d '[:space:]' < "$STAMP")" = "$TODAY" ]; then exit 0; fi

NODE="${NODE:-$(command -v node || true)}"
[ -x "$NODE" ] || { log "node not found (set NODE=/path/to/node)"; exit 1; }

# Serialize with the SessionEnd hook so an ingest never runs during a reset.
exec 9> "$LOG_DIR/.lock"
flock -w 600 9 || { log "skip: could not get lock"; exit 1; }

cd "$REPO" || exit 1
export GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=20}"

# Runs a git command, retrying with exponential backoff (10s, 20s, 40s, 80s) so a run that
# starts right after wake, before the network is up, still succeeds.
git_retry() {
  local name="$1"; shift
  local out delay
  for i in 1 2 3 4 5; do
    if out="$(git "$@" 2>&1)"; then
      [ "$i" -gt 1 ] && log "$name succeeded on attempt $i"
      return 0
    fi
    [ "$i" -eq 5 ] && { log "$name failed after 5 attempts: $out"; return 1; }
    delay=$((10 * 2 ** (i - 1)))
    log "$name attempt $i failed, retrying in ${delay}s: $out"
    sleep "$delay"
  done
}

# Unpushed files other than data/usage.json, if any.
other_unpushed() { git diff --name-only origin/main HEAD | grep -vx 'data/usage.json' || true; }

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || { log "skip: on branch '$branch', not main"; exit 0; }

for attempt in 1 2 3; do
  git_retry fetch fetch -q origin main || exit 1

  # Get onto origin/main. Local snapshot changes are dropped: ingest rebuilds them from
  # ~/.claude on top of the latest snapshot.
  if ! git merge-base --is-ancestor origin/main HEAD || ! git merge-base --is-ancestor HEAD origin/main; then
    other="$(other_unpushed)"
    if [ -n "$(git log origin/main..HEAD --format=%h)" ] && [ -n "$other" ]; then
      log "skip: unpushed commits also change $(echo $other | tr ' ' ','). Push manually."
      exit 0
    fi
    git checkout -q -- data/usage.json
    if ! out="$(git reset -q --keep origin/main 2>&1)"; then
      log "skip: could not move to origin/main (local edits in the way?): $out"
      exit 1
    fi
  fi

  if ! out="$("$NODE" node_modules/tsx/dist/cli.mjs scripts/ingest.ts 2>&1)"; then
    log "ingest failed: $out"; exit 1
  fi
  log "ingest: $(echo "$out" | grep -v -i -e deprecat -e trace-deprecation)"

  if ! git diff --quiet -- data/usage.json; then
    out="$(git commit -q -m "Refresh usage snapshot $TODAY" -- data/usage.json 2>&1)" || { log "commit failed: $out"; exit 1; }
    log "committed $(git rev-parse --short HEAD)"
  else
    log "no data changes"
  fi

  if [ -z "$(git log origin/main..HEAD --format=%h)" ]; then
    log "nothing to push"; echo "$TODAY" > "$STAMP"; exit 0
  fi

  if out="$(git push -q origin main 2>&1)"; then
    log "pushed"; echo "$TODAY" > "$STAMP"; exit 0
  fi
  if git fetch -q origin main 2>/dev/null && ! git merge-base --is-ancestor origin/main HEAD; then
    log "push rejected (another machine pushed first), retrying: $out"
    continue
  fi
  git_retry push push -q origin main || exit 1
  log "pushed"; echo "$TODAY" > "$STAMP"; exit 0
done
log "gave up after 3 push races"
exit 1
