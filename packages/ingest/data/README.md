# special-events.json

Manually-curated date ranges (Leagues seasons, Fresh Start Worlds, betas,
etc.) worth flagging on trend charts, since mod.io/the wikis don't know
about them. Unlike `game_updates` (scraped weekly, append-only), this file
is hand-edited and wholesale-replaces `special_events` on every sync --
editing an entry here just updates it, no separate migration needed.

Each entry:

```json
{
  "game": "oldschool",
  "title": "Demonic Pacts League",
  "start": "2026-04-15",
  "end": "2026-06-11",
  "url": "https://oldschool.runescape.wiki/w/Demonic_Pacts_League"
}
```

- `game`: `"runescape"` (RS3/mod.io) or `"oldschool"` for OSRS. This is
  deliberately narrower than the app-wide `GameKey` (`"runescape" | "osrs" |
  "runelite"`, used by `plugins.game` etc.) -- RuneLite and OSRS-via-mod.io
  are the same underlying game with different data sources, so both should
  read the *same* set of events/updates rather than being tracked
  separately. `getGameUpdates`/`getSpecialEvents` (see `normalizeAnnotationGame`
  in `packages/db/src/queries.ts`) map an incoming `"runelite"` or `"osrs"`
  onto `"oldschool"` before querying either table -- so write `"oldschool"`
  here and both `?game=runelite` and (eventually) `?game=osrs` plugin pages
  pick it up automatically.
- `title`: shown on the chart.
- `start`: `YYYY-MM-DD`.
- `end`: `YYYY-MM-DD`, or `null` for a still-ongoing/undated event (e.g. a
  beta with no announced end).
- `url`: a wiki page (or `null`) to link out to -- must start with `http://`
  or `https://` if set. Double-check the exact page title on the wiki first
  (capitalization and disambiguation suffixes matter, e.g. the 2020
  Trailblazer League page is `Trailblazer_League_(2020)`, not
  `Trailblazer_League`) -- a wrong title just 404s rather than failing the
  sync, since this field isn't validated against the wiki itself.

Pushing a change to this file on `main` triggers
`.github/workflows/sync-special-events.yml`, which syncs it straight to the
`special_events` table -- no full API deploy required.
