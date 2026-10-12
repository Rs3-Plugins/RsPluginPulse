#!/usr/bin/env bash
#
# One-time server setup for rspluginpulse's API + ingest, sharing a box that
# already runs another app (same Postgres cluster, same nginx, same
# cloudflared, same firewall/fail2ban). This script only touches things
# specific to THIS app -- it deliberately does not redo global setup
# (apt base packages, ufw, fail2ban, sysctl, the Postgres cluster itself),
# since re-running that on a shared box risks clobbering the other app's
# config (e.g. `ufw --force reset` would drop its rules too).
#
#   sudo bash deploy/bootstrap.sh
#
# Afterwards the box additionally has:
#   - a non-login `rspluginpulse` service user owning /srv/rspluginpulse
#   - a new Postgres role + database (in the EXISTING cluster)
#   - nginx proxying 127.0.0.1:8090 -> the API (not public)
#   - a systemd service for the API and a timer that runs ingest every 4h
#
# Safe to re-run: every step checks before acting.
set -euo pipefail

APP_USER=rspluginpulse
APP_ROOT=/srv/rspluginpulse
DB_NAME=rspluginpulse
DB_USER=rspluginpulse
NODE_MAJOR=24
API_PORT=3011
PROXY_PORT=8090
STATS_PORT=8091

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "run as root: sudo bash $0" >&2
  exit 1
fi

# ---------------------------------------------------------------- node
# Checked, not reinstalled blindly -- the other app on this box already
# needs a specific major version, and this app uses the same one.
log "Node $NODE_MAJOR"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_MAJOR}.* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y -qq nodejs
fi
node -v

# ---------------------------------------------------------------- goaccess
# For the traffic dashboard configure.sh sets up. Likely already present
# from the other app's bootstrap; installed here too so this script is
# self-sufficient on a box that doesn't have it yet.
log "GoAccess + htpasswd"
if ! command -v goaccess >/dev/null 2>&1 || ! command -v htpasswd >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq goaccess apache2-utils
fi

# ---------------------------------------------------------------- service user
log "Service user: $APP_USER"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos '' --home "$APP_ROOT" --shell /bin/bash "$APP_USER"
fi
passwd -l "$APP_USER" >/dev/null
mkdir -p "$APP_ROOT/.ssh"
touch "$APP_ROOT/.ssh/authorized_keys"
chown -R "$APP_USER:$APP_USER" "$APP_ROOT/.ssh"
chmod 700 "$APP_ROOT/.ssh"
chmod 600 "$APP_ROOT/.ssh/authorized_keys"
mkdir -p "$APP_ROOT"/{releases,shared,shared/cache/cards}
chown -R "$APP_USER:$APP_USER" "$APP_ROOT"
chmod 751 "$APP_ROOT"
chmod 700 "$APP_ROOT/shared"

# ---------------------------------------------------------------- postgres
# Assumes PostgreSQL is already installed and tuned (shared with the other
# app on this box) -- this only adds a role and database within it.
log "Database and role (existing Postgres cluster)"
command -v psql >/dev/null 2>&1 || { warn "psql not found -- is PostgreSQL installed on this box yet?"; exit 1; }

DB_PASS_FILE="$APP_ROOT/shared/db_password"
if [[ ! -f "$DB_PASS_FILE" ]]; then
  openssl rand -base64 36 | tr -d '\n/+=' | head -c 40 >"$DB_PASS_FILE"
  chown "$APP_USER:$APP_USER" "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
fi
DB_PASS=$(cat "$DB_PASS_FILE")

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL

if ! sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO ${DB_USER};
SQL

echo "postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}" \
  >"$APP_ROOT/shared/database_url"
chown "$APP_USER:$APP_USER" "$APP_ROOT/shared/database_url"
chmod 600 "$APP_ROOT/shared/database_url"

# ---------------------------------------------------- re-appliable config
log "Applying server configuration"
bash "$(dirname "$(readlink -f "$0")")/configure.sh"

log "Scoped sudo for deploys"
# Exactly the commands release.sh needs and nothing else. A separate file
# from the other app's sudoers drop-in, so the two stay independent.
cat >/etc/sudoers.d/rspluginpulse-deploy <<EOF
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl start rspluginpulse-api, \\
  /usr/bin/systemctl stop rspluginpulse-api, \\
  /usr/bin/systemctl restart rspluginpulse-api, \\
  /usr/bin/systemctl enable rspluginpulse-api, \\
  /usr/bin/systemctl restart rspluginpulse-ingest, \\
  /usr/bin/systemctl reload nginx, \\
  /usr/sbin/nginx -t
EOF
chmod 440 /etc/sudoers.d/rspluginpulse-deploy
visudo -cf /etc/sudoers.d/rspluginpulse-deploy

# ---------------------------------------------------------------- done
log "Bootstrap complete"
cat <<EOF

Still to do by hand (each needs a secret only you have):

1. Cloudflare Tunnel -- reuses the SAME tunnel/cloudflared install as the
   other app on this box. In the Cloudflare dashboard (Zero Trust ->
   Networks -> Tunnels -> your tunnel -> Public Hostname), add:
     Subdomain: api   Domain: rspluginpulse.com   Service: http://127.0.0.1:${PROXY_PORT}

2. A deploy key for GitHub Actions:
     sudo -u ${APP_USER} ssh-keygen -t ed25519 -f /tmp/rspluginpulse_deploy -N ''
   Put the PUBLIC half in ${APP_ROOT}/.ssh/authorized_keys (owned by
   ${APP_USER}, chmod 600) and the PRIVATE half in the GitHub secret
   SSH_PRIVATE_KEY. Delete /tmp/rspluginpulse_deploy afterwards.

3. GitHub secrets: SSH_HOST, SSH_USER (=${APP_USER}), SSH_PRIVATE_KEY,
   SSH_KNOWN_HOSTS (ssh-keyscan -H <SERVER_IP>), SSH_PORT (only if not 22),
   plus any variable from .env.example you want set (DISCORD_WEBHOOK_URL,
   R2_* if using the embed-card cache bucket). DATABASE_URL is NOT one of
   them -- it lives at ${APP_ROOT}/shared/database_url, generated above.

4. Vercel: import packages/web as its own project (root directory
   packages/web). vercel.json already points it at
   https://api.rspluginpulse.com.

Traffic dashboard (GoAccess), regenerated every few minutes. Reach it via:
  a) SSH tunnel, no DNS needed:
       ssh -L ${STATS_PORT}:127.0.0.1:${STATS_PORT} ${APP_USER}@<SERVER_IP>
       open http://localhost:${STATS_PORT}
  b) Or add a second public hostname to the tunnel, e.g.
       stats.rspluginpulse.com -> http://127.0.0.1:${STATS_PORT}
Password is in /srv/rspluginpulse/shared/stats_password (never sent to GitHub).

Nothing new is listening publicly: nginx binds to 127.0.0.1:${PROXY_PORT} and
:${STATS_PORT} only, Postgres stays on localhost, and cloudflared dials out
the same as before.
EOF
