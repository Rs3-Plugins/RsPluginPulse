# RuneScape PluginPulse

Live at [rspluginpulse.com](https://rspluginpulse.com).

Install/download leaderboards and trends for RuneScape's mod.io plugins
(https://mod.io/g/runescape/m) and RuneLite's plugin hub.

RuneScape data comes from mod.io's public, unauthenticated web endpoint
(`https://mod.io/v1/games/@runescape/mods` with header `x-modio-origin: web`) —
the game's third-party API access is disabled, but this is the same endpoint
mod.io's own site calls, so no API key is needed or possible. RuneLite data
comes from RuneLite's own official endpoints (`static.runelite.net`,
`repo.runelite.net`, `api.runelite.net`) — see `packages/ingest/src/runelite.ts`.

## Packages

- `packages/db` — Postgres schema + query functions, shared by `api` and `ingest`.
- `packages/ingest` — pulls the current mod/plugin list from mod.io and the
  RuneLite plugin hub and writes a snapshot of each. Run by hand locally
  (`npm run ingest`, `npm run ingest:runelite`); automated every 4h in
  production by a systemd timer (see `deploy/README.md`). If a run throws
  and `DISCORD_WEBHOOK_URL` is set, it posts the error to that webhook (see
  `.env.example`); otherwise it just logs to stderr.
- `packages/api` — Next.js app exposing the public read API (CORS-open, anyone
  can call it):
  - `GET /api/leaderboard/plugins?period=alltime|hot|weekly|monthly`
  - `GET /api/leaderboard/authors?period=alltime|hot|weekly|monthly`
  - `GET /api/plugins/:id/trend`
- `packages/web` — static React+TS (Vite) site: leaderboard tables + a
  per-plugin trend chart, calling the API above.

## Setup

```bash
npm install
cp .env.example .env            # set DATABASE_URL to a real Postgres instance
cp packages/web/.env.example packages/web/.env

npm run migrate                 # creates tables
npm run ingest                  # pulls current mod.io data, one snapshot
npm run dev:api                 # http://localhost:3000
npm run dev:web                 # http://localhost:5173
```

Run `npm run ingest` (and `npm run ingest:runelite`) again later to
accumulate snapshot history — daily/monthly leaderboards get more accurate
the more snapshots exist. In production this runs on its own every 4h; see
`deploy/README.md`.

## Deploying

Self-hosted API + Postgres + ingest timer, Vercel for the static site — see
[`deploy/README.md`](deploy/README.md).

## Known simplifications

- Weekly/monthly leaderboards fall back to the earliest available snapshot
  when less than 7/30 days of history exists.
- No auth on the API; it's read-only public data by design.
