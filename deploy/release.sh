#!/usr/bin/env bash
#
# Activates an uploaded release. Runs on the server, invoked over SSH.
#
#   release.sh <release-id>
#
# Simple single-process deploy (no blue/green): stop, swap the `current`
# symlink, apply schema, start, wait for /api/status to answer. A deploy
# costs a few seconds of downtime -- acceptable for a read-mostly API fed by
# a periodic ingest, not a live interactive service.
set -euo pipefail

RELEASE_ID="${1:?usage: release.sh <release-id>}"
APP_ROOT=/srv/rspluginpulse
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
API_PORT=3011
HEALTH_TIMEOUT=30
KEEP_RELEASES=5

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m!!  %s\033[0m\n' "$*" >&2; exit 1; }

[[ -d "$RELEASE_DIR" ]] || fail "no such release: $RELEASE_DIR"
[[ -f "$APP_ROOT/shared/.env" ]] || fail "missing $APP_ROOT/shared/.env"

# ---------------------------------------------------------------- env
DB_URL=$(cat "$APP_ROOT/shared/database_url")
grep -q '^DATABASE_URL=' "$APP_ROOT/shared/.env" \
  || echo "DATABASE_URL=$DB_URL" >>"$APP_ROOT/shared/.env"
chmod 600 "$APP_ROOT/shared/.env"

# ---------------------------------------------------------------- schema
# schema.sql is all CREATE-IF-NOT-EXISTS / ADD-COLUMN-IF-NOT-EXISTS, so
# applying it is safe on every deploy -- no separate migration framework.
log "Applying schema"
export DATABASE_URL="$DB_URL"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$RELEASE_DIR/packages/db/src/schema.sql" \
  || fail "schema apply failed -- current release left running"

# ---------------------------------------------------------------- config drift
CONFIG_SRC="$RELEASE_DIR/deploy/configure.sh"
CONFIG_STAMP="$APP_ROOT/shared/configure.sha"
if [[ -f "$CONFIG_SRC" ]]; then
  want=$(sha256sum "$CONFIG_SRC" | cut -d' ' -f1)
  have=$(cat "$CONFIG_STAMP" 2>/dev/null || echo none)
  if [[ "$want" != "$have" ]]; then
    log "deploy/configure.sh changed -- re-run manually:"
    echo "    sudo bash $CONFIG_SRC"
    echo "$want" >"$CONFIG_STAMP"
  fi
fi

# ---------------------------------------------------------------- switch
log "Switching current -> $RELEASE_ID"
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"

log "Restarting rspluginpulse-api"
sudo systemctl restart rspluginpulse-api

# Best-effort: presence isn't on the API's health-check critical path, and
# a box that hasn't re-run configure.sh yet (see "config drift" above)
# won't have this unit at all.
log "Restarting rspluginpulse-discord-bot"
sudo systemctl restart rspluginpulse-discord-bot 2>/dev/null || true

log "Waiting for http://127.0.0.1:${API_PORT}/api/status (max ${HEALTH_TIMEOUT}s)"
healthy=0
for ((i = 0; i < HEALTH_TIMEOUT; i++)); do
  if curl -fsS --max-time 3 "http://127.0.0.1:${API_PORT}/api/status" >/dev/null 2>&1; then
    healthy=1
    echo "  healthy after ${i}s"
    break
  fi
  sleep 1
done

if [[ $healthy -ne 1 ]]; then
  echo "--- last 40 log lines ---" >&2
  journalctl -u rspluginpulse-api -n 40 --no-pager >&2 || true
  fail "new release never answered /api/status -- check the logs above"
fi

sudo systemctl enable rspluginpulse-api >/dev/null 2>&1 || true
sudo systemctl enable rspluginpulse-discord-bot >/dev/null 2>&1 || true

# ---------------------------------------------------------------- prune
log "Pruning old releases (keeping $KEEP_RELEASES)"
cd "$APP_ROOT/releases"
keep=$(readlink -f "$APP_ROOT/current" 2>/dev/null || echo)
ls -1dt */ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r dir; do
  full=$(readlink -f "$dir")
  [[ "$full" == "$keep" ]] && continue
  rm -rf -- "$dir"
done

log "Deployed $RELEASE_ID"
