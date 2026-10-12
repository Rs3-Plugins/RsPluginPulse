# Self-hosted deploy (API + Postgres + ingest)

The web app stays on Vercel. This covers the API, its database, and the
periodic ingest job on the same Ubuntu box that already runs another app
(different ports, different domain, same Cloudflare Tunnel), reached through
that tunnel so **no inbound port is ever opened**.

```
browser ─▶ Vercel (static)
                     │ fetch() straight to the API (CORS-open)
                     ▼
            Cloudflare edge
                     │  tunnel, outbound-only
                     ▼
   your server: cloudflared ─▶ nginx 127.0.0.1:8090 ─▶ API :3011
                                                           │
                                                           ▼
                                              Postgres on localhost
                                           (same cluster as the other app)
```

No blue/green here — this is a read-mostly API fed by a periodic ingest, not
a live interactive service, so a deploy is: stop, swap code, apply schema,
start, wait for `/api/status`. A few seconds of downtime per deploy.

## Files

| File | Runs | Purpose |
|---|---|---|
| `bootstrap.sh` | once, on the server as root | new service user, new Postgres role/db, scoped sudo |
| `configure.sh` | on the server, re-appliable | nginx site, API systemd service, **ingest systemd timer (every 4h)**, GoAccess traffic dashboard |
| `release.sh` | on the server, per deploy | swap release, apply schema, restart, health check |
| `render-env.mjs` | in CI | builds `.env` from `.env.example` + GitHub secrets |
| `../.github/workflows/deploy-api.yml` | GitHub Actions | build, ship, activate |

## One-time setup

### 1. Bootstrap the server

This box already has Node, nginx, cloudflared, Postgres, ufw and fail2ban
set up for another app — `bootstrap.sh` only adds what's new for this one
(a dedicated `rspluginpulse` user, a new Postgres role/database in the
existing cluster, its own nginx site and systemd units). It does **not**
touch the firewall, re-tune Postgres, or re-run global setup, since doing
that on a shared box risks breaking the other app.

```bash
git clone <your repo> /tmp/rspluginpulse && cd /tmp/rspluginpulse
sudo bash deploy/bootstrap.sh
```

Idempotent — safe to re-run. It generates the database password itself and
writes the connection string to `/srv/rspluginpulse/shared/database_url`.
**That value never goes to GitHub.**

### 2. Cloudflare Tunnel

Reuses the same tunnel/cloudflared install as the other app — just add a
second public hostname to it (Zero Trust → Networks → Tunnels → your
tunnel → Public Hostname):

| Field | Value |
|---|---|
| Subdomain | `api` |
| Domain | `rspluginpulse.com` |
| Service | `http://127.0.0.1:8090` |

### 3. Deploy key

```bash
sudo -u rspluginpulse ssh-keygen -t ed25519 -f ./rspluginpulse_deploy -N '' -C 'github-actions'
sudo tee -a /srv/rspluginpulse/.ssh/authorized_keys < ./rspluginpulse_deploy.pub
sudo chown rspluginpulse:rspluginpulse /srv/rspluginpulse/.ssh/authorized_keys
sudo chmod 600 /srv/rspluginpulse/.ssh/authorized_keys
ssh-keyscan -H <SERVER_IP>        # for SSH_KNOWN_HOSTS
```

Put the private half in the `SSH_PRIVATE_KEY` secret, then delete your local
copy.

### 4. GitHub configuration

**Secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `SSH_HOST` | server IP or hostname |
| `SSH_USER` | `rspluginpulse` |
| `SSH_PRIVATE_KEY` | private half of the deploy key |
| `SSH_KNOWN_HOSTS` | output of `ssh-keyscan -H <SERVER_IP>` |
| `SSH_PORT` | only if not 22 |
| `DISCORD_WEBHOOK_URL` | optional — ingest failure alerts |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PREFIX` | optional — only if moving the embed-card cache off local disk |

**Variables** (not secrets):

| Variable | Value |
|---|---|
| `API_PUBLIC_URL` | `https://api.rspluginpulse.com` — enables the post-deploy public health check |

### 5. Vercel

Import `packages/web` as its own Vercel project (set the project's root
directory to `packages/web`). `vercel.json` already points the build at
`https://api.rspluginpulse.com` and sets the CSP/cache headers — nothing
else to configure. Vercel deploys on every push via its own GitHub
integration, independent of the Actions workflow above.

## How a deploy works

Push to `production` (touching `packages/db`, `packages/api`, `packages/ingest`,
or `deploy/`), then:

1. CI installs, builds the API (`next build`)
2. Bundles `node_modules` + each workspace's source + `deploy/` into a
   release tarball — no separate install step needed on the server
3. Renders `.env` and uploads both to the server
4. `release.sh` applies `schema.sql` (idempotent — `CREATE ... IF NOT
   EXISTS` throughout, no migration framework needed), swaps the `current`
   symlink, restarts the service
5. Polls `/api/status` until it answers (up to 30s)
6. If it never answers, the release stops there and CI fails with the new
   process's logs — the **old** release's files are still on disk (nothing
   is deleted until a later successful deploy prunes it), but the service
   itself is left stopped, so that failure is loud rather than silently
   serving stale code. Re-run the previous commit's workflow to redeploy it.

Pruning keeps the last 5 releases in `/srv/rspluginpulse/releases`.

## The ingest timer

This is the actual "every few hours" automation: `configure.sh` installs a
systemd timer that runs both `npm run ingest` and `npm run ingest:runelite`
every 4 hours (`OnUnitActiveSec=4h` — see `INGEST_INTERVAL` in
`configure.sh` to change it), starting 5 minutes after boot. Output goes to
the journal, not a separate log file:

```bash
systemctl list-timers rspluginpulse-ingest   # see when it last/next ran
journalctl -u rspluginpulse-ingest -f        # watch it run
sudo systemctl start rspluginpulse-ingest    # run it right now
```

If either ingest throws, it posts to `DISCORD_WEBHOOK_URL` itself (see
`packages/ingest/src/discordNotify.ts`) — the timer doesn't need its own
alerting on top of that.

## Embed card cache

Rendered SVG cards (`/api/card/...`) are cached to disk by default
(`packages/api/src/lib/cardCache.ts`), falling back to R2 only if the five
`R2_*` secrets are set. `configure.sh` points `CARD_CACHE_DIR` at
`/srv/rspluginpulse/shared/cache/cards` — **not** the default
`packages/api/.cache/cards`, which lives under `current/`, the symlink
`release.sh` repoints to a new release on every deploy. Using the default
would silently empty the cache (and cost a re-render per card) on every
deploy; `shared/` persists across all of them. R2 isn't needed here unless
this ever runs on more than one API instance at once, sharing one cache —
it doesn't today.

## Rollback

Releases are kept, so roll back by re-running against an older one:

```bash
ssh rspluginpulse@<host>
ls -lt /srv/rspluginpulse/releases
bash /srv/rspluginpulse/releases/<older-sha>/deploy/release.sh <older-sha>
```

This re-applies that release's `schema.sql` too, which is harmless since
it's additive-only. It won't undo a change that isn't additive — there
isn't one yet, but if a future schema change needs to drop or rename
something, split it into expand (deploy, add the new thing) and contract
(a later deploy removes the old) the same way the other app on this box
does, or a rollback here will fail against the newer schema.

## Security posture

Same box, same posture as the other app already set up: no inbound ports
except SSH (the tunnel dials out), Postgres and nginx both bind to
loopback, the service user has no password and a locked account, sudo is
restricted to the exact systemctl/nginx commands `release.sh` needs, and
systemd hardening (`NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`,
writable only under `/srv/rspluginpulse`).

## Postgres tuning

The app's workload is read/query-heavy, not write-heavy: the ingest timer
does one batch insert every 4h, but the leaderboard, search, and stats
pages run SELECT-only aggregation queries (window functions, per-plugin
correlated subqueries) against a `plugin_snapshots` table that only grows.
Postgres's defaults assume a much smaller, more balanced workload.

**Not applied yet** -- this is a shared cluster (Group-Ironman-Backend runs
on the same Postgres instance), so these need to be checked against the
VPS's actual RAM and reviewed before touching a live, shared service.
Recommended `postgresql.conf` changes, scaled to the box's real memory
(the values below assume a small VPS with a few GB of RAM; scale
`shared_buffers` to ~25% and `effective_cache_size` to ~50-75% of total
RAM instead if it's larger):

```conf
shared_buffers = 256MB              # Postgres's own page cache
effective_cache_size = 2GB          # planner hint: how much the OS also caches
work_mem = 32MB                     # per-sort/hash-op memory for the GROUP BY/
                                     # window-function queries the leaderboard runs
random_page_cost = 1.1              # assumes SSD, not spinning disk (default: 4.0)
effective_io_concurrency = 200      # SSD can handle concurrent reads (default: 1)
default_statistics_target = 200     # better plans on the large plugin_snapshots table
max_parallel_workers_per_gather = 4 # parallelize the big aggregation queries
```

`work_mem` is per sort/hash operation, not per connection -- a complex
query can use several multiples of it, and it's shared across every
connection on the cluster (including Group-Ironman-Backend's), so don't
scale it up carelessly on a small box. After changing
`default_statistics_target`, re-run `ANALYZE` on `plugins` and
`plugin_snapshots` for it to take effect.

The local dev Postgres (`packages/db/src/local-postgres.ts`) already runs
with the same settings via `postgresFlags`, verified against the
benchmark queries in this session (10-15% faster on the heaviest
aggregation queries; the dataset is still small enough that the biggest
win -- `shared_buffers`/`effective_cache_size` -- matters more as it grows).

## Checking on it

```bash
systemctl status rspluginpulse-api
journalctl -u rspluginpulse-api -f
curl -s localhost:8090/api/status | jq
systemctl list-timers rspluginpulse-ingest
```

## Request dashboard

GoAccess regenerates an HTML report (`report.html`) plus a small custom
panel (`index.html`, `deploy/panel/index.html` in the repo) every 3 minutes
from the nginx access log: request counts, status-code breakdown, top
endpoints, and hits-by-hour. Same tool/pattern as the other app on this
box, on its own port (`8091`) with its own log format and basic-auth
password — fully independent of that app's dashboard.

```bash
sudo systemctl start rspluginpulse-stats   # regenerate now
systemctl list-timers rspluginpulse-stats  # check the schedule
```

Reach it either way:

```bash
# a) SSH tunnel — no DNS needed
ssh -L 8091:127.0.0.1:8091 rspluginpulse@<host>
# open http://localhost:8091

# b) Through the Cloudflare Tunnel — add a second public hostname:
#      stats.rspluginpulse.com  ->  HTTP  ->  127.0.0.1:8091
```

The password is at `/srv/rspluginpulse/shared/stats_password` (mode 600,
generated by `bootstrap.sh`, never sent to GitHub) — it's the only thing in
front of this, and the report lists every client IP and path requested, so
treat it as a real credential.

Unlike the other app's dashboard, this one has no "live viewers/players"
tiles — rspluginpulse has no equivalent live-gameplay endpoint to proxy, so
the panel only shows the generic traffic metrics GoAccess itself produces.

## Not set up yet (by design — see the deploy scoping decision)

- **No automated backups.** The snapshot history is re-derivable from
  mod.io/RuneLite if ever lost (unlike, say, a credential that never
  rotates) — not zero-cost to lose, but not urgent enough to need the
  nightly-pg_dump-to-R2 machinery the other app on this box has. Add it
  later by copying that app's `rs3-backup` pattern if the history grows
  valuable enough to want.
- **No blue/green.** A deploy has a few seconds of downtime. Fine for a
  read-mostly API with no live interactive traffic; revisit if that stops
  being true.
