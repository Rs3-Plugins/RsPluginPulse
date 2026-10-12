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
STATS_PORT=8091
# How often ingest runs. 4h matches mod.io/RuneLite not changing fast enough
# to need anything tighter.
INGEST_INTERVAL="${INGEST_INTERVAL:-4h}"
# How often the GoAccess report is rebuilt.
STATS_INTERVAL="${STATS_INTERVAL:-3min}"
# GoAccess built-in theme: darkBlue | darkPurple | darkGray | bright.
STATS_THEME="${STATS_THEME:-darkBlue}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "run as root: sudo bash $0" >&2
  exit 1
fi

# ---------------------------------------------------------------- nginx logging
# Own log_format name (not the other app's), since log_format itself is
# fine to declare more than once as long as the names differ.
#
# real_ip_header/set_real_ip_from/real_ip_recursive are NOT redeclared here
# -- those are singleton directives in the http{} context (every conf.d
# file loads into the same one), and the other app's bootstrap already set
# them so $remote_addr resolves correctly for every server block, not just
# its own. Redeclaring them is a duplicate-directive config error. If this
# is ever deployed on a box without that other app, add back:
#   set_real_ip_from 127.0.0.1; set_real_ip_from ::1;
#   real_ip_header CF-Connecting-IP; real_ip_recursive on;
log "nginx log format"
cat >/etc/nginx/conf.d/rspluginpulse-logformat.conf <<'EOF'
log_format rspluginpulse '$remote_addr - $remote_user [$time_local] "$request" '
               '$status $body_bytes_sent "$http_referer" "$http_user_agent" '
               '$request_time';
EOF

# ---------------------------------------------------------------- nginx
log "nginx site on 127.0.0.1:${PROXY_PORT}"
cat >/etc/nginx/sites-available/rspluginpulse-api <<EOF
server {
    listen 127.0.0.1:${PROXY_PORT};
    server_name _;

    access_log /var/log/nginx/rspluginpulse-access.log rspluginpulse;

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

# ---------------------------------------------------------------- goaccess
log "GoAccess traffic dashboard on 127.0.0.1:${STATS_PORT}"
mkdir -p "$APP_ROOT/goaccess"
chown "$APP_USER:$APP_USER" "$APP_ROOT/goaccess"
chmod 755 "$APP_ROOT/goaccess"

PANEL_SRC="$(dirname "$(readlink -f "$0")")/panel/index.html"
if [[ -f "$PANEL_SRC" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 644 "$PANEL_SRC" "$APP_ROOT/goaccess/index.html"
  log "Installed panel -> $APP_ROOT/goaccess/index.html"
else
  printf '\033[1;33m!!  %s\033[0m\n' "panel/index.html missing beside configure.sh; dashboard not installed"
fi

# nginx logs are root:adm 640; read them via the adm group rather than as root.
usermod -aG adm "$APP_USER"

echo "$STATS_THEME" >"$APP_ROOT/goaccess/theme"
chown "$APP_USER:$APP_USER" "$APP_ROOT/goaccess/theme"

cat >/usr/local/bin/rspluginpulse-stats <<'EOF'
#!/usr/bin/env bash
# Regenerates the request report: HTML for GoAccess's own detail view, JSON
# for the custom panel. Quoted heredoc -- nothing below is expanded at
# install time.
set -euo pipefail

DIR=/srv/rspluginpulse/goaccess
OUT="$DIR/report.html"
JSON="$DIR/report.json"
TMP_HTML="$DIR/.report.new.html"
TMP_JSON="$DIR/.report.new.json"
THEME=$(cat "$DIR/theme" 2>/dev/null || echo darkBlue)

shopt -s nullglob
LOGS=("/var/log/nginx/rspluginpulse-access.log"*)
FMT='%h %^[%d:%t %^] "%r" %s %b "%R" "%u" %T'
if [[ ${#LOGS[@]} -eq 0 ]]; then
  LOGS=("/var/log/nginx/access.log"*)
  FMT='COMBINED'
fi

empty_json() {
  echo '{"general":{"total_requests":0,"failed_requests":0}}' >"$JSON"
}

placeholder() {
  printf '<!doctype html><meta charset="utf-8"><title>rspluginpulse stats</title>
<body style="font-family:system-ui;padding:2rem;max-width:40rem">
<h1>No requests logged yet</h1><p>%s</p>
<p>nginx creates the log on its first request, and the report regenerates
every few minutes.</p><p><small>Checked %s</small></p>' "$1" "$(date -u)" \
    >"$TMP_HTML"
  mv "$TMP_HTML" "$OUT"
  empty_json
  exit 0
}

[[ ${#LOGS[@]} -gt 0 ]] || placeholder "No access log yet."
[[ -n "$(zcat -f "${LOGS[@]}" 2>/dev/null | head -c 1)" ]] \
  || placeholder "The access log exists but is empty."

run() {
  zcat -f "${LOGS[@]}" 2>/dev/null \
    | goaccess - \
        --log-format="$FMT" \
        --date-format='%d/%b/%Y' \
        --time-format='%H:%M:%S' \
        "$@"
}

run --agent-list --html-prefs "{\"theme\":\"$THEME\"}" -o "$TMP_HTML"
run -o "$TMP_JSON"

mv "$TMP_JSON" "$JSON"
mv "$TMP_HTML" "$OUT"
EOF
chmod 755 /usr/local/bin/rspluginpulse-stats

cat >/etc/systemd/system/rspluginpulse-stats.service <<EOF
[Unit]
Description=Regenerate the rspluginpulse GoAccess request report
[Service]
Type=oneshot
User=${APP_USER}
ExecStart=/usr/local/bin/rspluginpulse-stats
EOF

cat >/etc/systemd/system/rspluginpulse-stats.timer <<EOF
[Unit]
Description=Regenerate the rspluginpulse GoAccess request report every ${STATS_INTERVAL}
[Timer]
OnBootSec=1min
OnUnitActiveSec=${STATS_INTERVAL}
Persistent=true
[Install]
WantedBy=timers.target
EOF

# Password for the stats panel. Generated once and kept on the box, same as
# the database password -- never printed to a log or sent to GitHub.
STATS_PASS_FILE="$APP_ROOT/shared/stats_password"
if [[ ! -f "$STATS_PASS_FILE" ]]; then
  openssl rand -base64 24 | tr -d '\n/+=' | head -c 24 >"$STATS_PASS_FILE"
  chmod 600 "$STATS_PASS_FILE"
  chown "$APP_USER:$APP_USER" "$STATS_PASS_FILE"
fi
htpasswd -bc /etc/nginx/.rspluginpulse-stats-htpasswd admin "$(cat "$STATS_PASS_FILE")" >/dev/null 2>&1
chown root:www-data /etc/nginx/.rspluginpulse-stats-htpasswd
chmod 640 /etc/nginx/.rspluginpulse-stats-htpasswd

cat >/etc/nginx/sites-available/rspluginpulse-stats <<EOF
server {
    listen 127.0.0.1:${STATS_PORT};
    server_name _;
    root ${APP_ROOT}/goaccess;
    index index.html;

    access_log /var/log/nginx/rspluginpulse-stats-access.log rspluginpulse;

    location / {
        auth_basic "rspluginpulse stats";
        auth_basic_user_file /etc/nginx/.rspluginpulse-stats-htpasswd;

        try_files \$uri \$uri/ =404;
    }
}
EOF
ln -sf /etc/nginx/sites-available/rspluginpulse-stats /etc/nginx/sites-enabled/rspluginpulse-stats

nginx -t
systemctl reload nginx
systemctl daemon-reload
systemctl enable --now rspluginpulse-stats.timer

log "Refreshing the request report"
systemctl start rspluginpulse-stats || printf '\033[1;33m!!  report refresh failed; see: journalctl -u rspluginpulse-stats\033[0m\n'

log "Configuration applied"
echo "Check the ingest timer with:  systemctl list-timers rspluginpulse-ingest"
echo "Run it once right now with:   sudo systemctl start rspluginpulse-ingest"
echo "Stats panel password:         $(cat "$STATS_PASS_FILE")"
echo "Reach the stats panel via:    ssh -L ${STATS_PORT}:127.0.0.1:${STATS_PORT} ${APP_USER}@<SERVER_IP>, then http://localhost:${STATS_PORT}"
echo "  (or add a tunnel hostname, e.g. stats.rspluginpulse.com -> http://127.0.0.1:${STATS_PORT})"
