# RuneScape PluginPulse

Live at [rspluginpulse.com](https://rspluginpulse.com).

Install/download leaderboards and trends for RuneScape's mod.io plugins
(https://mod.io/g/runescape/m).

Data comes from mod.io's public, unauthenticated web endpoint
(`https://mod.io/v1/games/@runescape/mods` with header `x-modio-origin: web`) —
the game's third-party API access is disabled, but this is the same endpoint
mod.io's own site calls, so no API key is needed or possible.

## Packages

- `packages/db` — Postgres schema + query functions, shared by `api` and `ingest`.
- `packages/ingest` — manually-run script that pulls the current mod list from
  mod.io and writes a snapshot. **Not automated yet** — run it by hand every so
  often (every ~6h is the eventual target once scheduling is wired up). If a
  run throws and `DISCORD_WEBHOOK_URL` is set, it posts the error to that
  webhook (see `.env.example`); otherwise it just logs to stderr.
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

Run `npm run ingest` again later (or wire it to a scheduler) to accumulate
snapshot history — daily/monthly leaderboards get more accurate the more
snapshots exist.

## Known simplifications

- Single game only (RuneScape, mod.io game id 13295) — no multi-game support.
- No scheduled ingestion yet — manual `npm run ingest` runs only.
- Weekly/monthly leaderboards fall back to the earliest available snapshot
  when less than 7/30 days of history exists.
- No auth on the API; it's read-only public data by design.
