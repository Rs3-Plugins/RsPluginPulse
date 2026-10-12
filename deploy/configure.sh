#!/usr/bin/env bash
#
# Re-appliable server configuration: nginx site, systemd service + ingest
# timer. Split out of bootstrap.sh so a deploy can re-apply it safely.
#
#   sudo bash deploy/configure.sh
set -euo pipefail

APP_USER=rspluginpulse
APP_ROOT=/srv/rspluginpulse
API_PORT=3011
PROXY_PORT=8090
# How often ingest runs. 4h matches mod.io/RuneLite not changing fast enough
# to need anything tighter.
INGEST_INTERVAL="${INGEST_INTERVAL:-4h}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "run as root: sudo bash $0" >&2
  exit 1
fi

# ---------------------------------------------------------------- nginx
log "nginx site on 127.0.0.1:${PROXY_PORT}"
cat >/etc/nginx/sites-available/rspluginpulse-api <<EOF
server {
    listen 127.0.0.1:${PROXY_PORT};
    server_name _;

    access_log /var/log/nginx/rspluginpulse-access.log;

    location / {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 30s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/rspluginpulse-api /etc/nginx/sites-enabled/rspluginpulse-api
nginx -t
systemctl reload nginx

# ---------------------------------------------------------------- api service
log "systemd service rspluginpulse-api"
cat >/etc/systemd/system/rspluginpulse-api.service <<EOF
[Unit]
Description=rspluginpulse API (Next.js)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_ROOT}/current/packages/api
EnvironmentFile=${APP_ROOT}/shared/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx next start -p ${API_PORT}
Restart=always
RestartSec=2

LimitNOFILE=65535
KillSignal=SIGTERM
TimeoutStopSec=25

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_ROOT}
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

# ---------------------------------------------------------------- ingest timer
log "systemd timer rspluginpulse-ingest (every ${INGEST_INTERVAL})"
cat >/etc/systemd/system/rspluginpulse-ingest.service <<EOF
[Unit]
Description=rspluginpulse ingest (mod.io + RuneLite)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_ROOT}/current
EnvironmentFile=${APP_ROOT}/shared/.env
# Each command's output goes to the journal (journalctl -u rspluginpulse-ingest)
# -- no separate log file to rotate. '; true' on the first so a failed mod.io
# run doesn't skip the RuneLite one; the overall unit's exit code (and the
# Discord webhook each script sends on its own failure) still reflect a
# failure if either one did.
ExecStart=/bin/bash -c 'npm run ingest -w @rspluginpulse/ingest; npm run ingest:runelite -w @rspluginpulse/ingest'
EOF

cat >/etc/systemd/system/rspluginpulse-ingest.timer <<EOF
[Unit]
Description=Run rspluginpulse ingest every ${INGEST_INTERVAL}
[Timer]
OnBootSec=5min
OnUnitActiveSec=${INGEST_INTERVAL}
Persistent=true
[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now rspluginpulse-ingest.timer

log "Configuration applied"
echo "Check the ingest timer with:  systemctl list-timers rspluginpulse-ingest"
echo "Run it once right now with:   sudo systemctl start rspluginpulse-ingest"
