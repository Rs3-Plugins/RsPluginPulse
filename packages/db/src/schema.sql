-- RuneScape PluginPulse schema.
-- Keyed by mod.io's mod id, which is stable and never reassigned.
-- Author info (name, profile url, avatar) is denormalized onto plugins
-- rather than a separate authors table, since mod.io has no stable
-- per-author endpoint here -- author pages are built by aggregating
-- across the plugins rows that share an author_id.

CREATE TABLE IF NOT EXISTS plugins (
  id INTEGER PRIMARY KEY,
  name_id TEXT NOT NULL,
  name TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  author_profile_url TEXT NOT NULL DEFAULT '',
  author_avatar_url TEXT,
  profile_url TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  logo_url TEXT,
  summary TEXT NOT NULL DEFAULT '',
  ratings_total INTEGER NOT NULL DEFAULT 0,
  ratings_positive INTEGER NOT NULL DEFAULT 0,
  ratings_negative INTEGER NOT NULL DEFAULT 0,
  ratings_percentage_positive INTEGER NOT NULL DEFAULT 0,
  ratings_display_text TEXT NOT NULL DEFAULT '',
  date_added TIMESTAMPTZ NOT NULL,
  date_updated TIMESTAMPTZ NOT NULL
);

ALTER TABLE plugins ADD COLUMN IF NOT EXISTS author_profile_url TEXT NOT NULL DEFAULT '';
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS author_avatar_url TEXT;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS ratings_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS ratings_positive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS ratings_negative INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS ratings_percentage_positive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS ratings_display_text TEXT NOT NULL DEFAULT '';

-- Multi-game support. 'runescape' (mod.io) is the original/default scope;
-- new games (e.g. 'runelite') live in the same tables so the API and site
-- logic stay identical and only filter by this column. mod.io's plugin
-- and author ids are real upstream integers; non-mod.io games mint their
-- own surrogate integer ids (see external_id_map below) so every existing
-- `Number(id)`-based route/page keeps working unmodified.
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS game TEXT NOT NULL DEFAULT 'runescape';

-- Renamed from the original 'rs3' key -- idempotent (a no-op once every
-- row has already been migrated), safe to leave in permanently rather
-- than adding a one-off migration script for it.
UPDATE plugins SET game = 'runescape' WHERE game = 'rs3';
ALTER TABLE plugins ALTER COLUMN game SET DEFAULT 'runescape';

CREATE INDEX IF NOT EXISTS plugins_game_idx ON plugins (game);

-- Stable integer ids for entities that don't have a native numeric id
-- upstream (e.g. RuneLite plugins keyed by internalName, authors keyed by
-- GitHub login). Minted once per (game, kind, external_key) and reused on
-- every later ingest run so history keeps lining up against the same id.
CREATE SEQUENCE IF NOT EXISTS external_id_seq START WITH 900000000 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS external_id_map (
  game TEXT NOT NULL,
  kind TEXT NOT NULL,
  external_key TEXT NOT NULL,
  id INTEGER NOT NULL,
  PRIMARY KEY (game, kind, external_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS external_id_map_id_idx ON external_id_map (kind, id);

-- Full contributor roster per plugin (mod.io always has exactly one row
-- here; RuneLite's plugin-hub manifest sometimes credits several people in
-- one free-text field, each of which gets their own row -- and their own
-- author id -- so they each get a real, individual author page rather
-- than being squashed into a single denormalized `plugins.author_*` row).
-- `plugins.author_id`/`author_name`/etc. stay as the first (primary)
-- entry here, purely so every existing primary-author-only query keeps
-- working unchanged.
CREATE TABLE IF NOT EXISTS plugin_authors (
  plugin_id INTEGER NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar_url TEXT,
  author_profile_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (plugin_id, author_id)
);

CREATE INDEX IF NOT EXISTS plugin_authors_author_idx ON plugin_authors (author_id);

-- One row per plugin per ingest run. captured_at is shared across every
-- plugin in a single run so windowed queries compare like-for-like.
CREATE TABLE IF NOT EXISTS plugin_snapshots (
  plugin_id INTEGER NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL,
  downloads_total INTEGER NOT NULL,
  downloads_today INTEGER NOT NULL,
  subscribers_total INTEGER NOT NULL,
  popularity_rank_position INTEGER,
  PRIMARY KEY (plugin_id, captured_at)
);

-- The plugin's own upstream "last updated" timestamp at the time of this
-- snapshot, so trend charts can mark when the plugin itself was released/
-- updated (not a game update) by diffing consecutive snapshots' values --
-- see getPluginTrend. NULL on every snapshot taken before this column
-- existed, so that detection only ever works from here forward, never
-- retroactively.
ALTER TABLE plugin_snapshots ADD COLUMN IF NOT EXISTS date_updated TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS plugin_snapshots_captured_at_idx
  ON plugin_snapshots (captured_at);

-- Denormalized from plugins.game (populated on every insert -- see
-- upsertPluginsAndSnapshot) purely so "latest snapshot for game X" can hit
-- an index on this table directly. Without it, that query has to join the
-- whole table against plugins to filter by game, which turns into a seq
-- scan once plugin_snapshots passes a few hundred thousand rows -- it's
-- well past a million now.
ALTER TABLE plugin_snapshots ADD COLUMN IF NOT EXISTS game TEXT;

UPDATE plugin_snapshots s SET game = p.game
  FROM plugins p WHERE p.id = s.plugin_id AND s.game IS NULL;

-- Same 'rs3' -> 'runescape' rename as plugins.game above -- this one
-- already had a value (backfilled, not NULL) before the rename, so it
-- needs its own explicit pass rather than relying on the IS NULL backfill.
UPDATE plugin_snapshots SET game = 'runescape' WHERE game = 'rs3';

CREATE INDEX IF NOT EXISTS plugin_snapshots_game_captured_idx
  ON plugin_snapshots (game, captured_at DESC);

CREATE INDEX IF NOT EXISTS plugin_snapshots_plugin_captured_idx
  ON plugin_snapshots (plugin_id, captured_at DESC);

-- Short links for the embeddable stats card (/api/card/{id}.svg), so an
-- embed URL carries an id instead of a theme/spark/etc query string.
-- Settings are looked up by id; identical combos reuse the same row
-- instead of minting a new short id every time.
CREATE TABLE IF NOT EXISTS embed_cards (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  theme TEXT NOT NULL DEFAULT 'dark',
  spark BOOLEAN NOT NULL DEFAULT true,
  spark_days INTEGER NOT NULL DEFAULT 30,
  show_subtitle BOOLEAN NOT NULL DEFAULT true,
  show_hot BOOLEAN NOT NULL DEFAULT true,
  show_stat_downloads BOOLEAN NOT NULL DEFAULT true,
  show_stat_week BOOLEAN NOT NULL DEFAULT true,
  show_stat_third BOOLEAN NOT NULL DEFAULT true,
  show_footer BOOLEAN NOT NULL DEFAULT true,
  show_image BOOLEAN NOT NULL DEFAULT true,
  accent_color TEXT NOT NULL DEFAULT '',
  bg_color TEXT NOT NULL DEFAULT '',
  text_color TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS spark_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS show_subtitle BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS show_hot BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS show_stat_downloads BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS show_stat_week BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS show_stat_third BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS show_footer BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS show_image BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '';
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS bg_color TEXT NOT NULL DEFAULT '';
ALTER TABLE embed_cards ADD COLUMN IF NOT EXISTS text_color TEXT NOT NULL DEFAULT '';
-- Old column from before per-stat toggles existed; no longer written or read.
ALTER TABLE embed_cards DROP COLUMN IF EXISTS show_stats;

DROP INDEX IF EXISTS embed_cards_combo_idx;
CREATE UNIQUE INDEX IF NOT EXISTS embed_cards_combo_idx
  ON embed_cards (
    type, entity_id, theme, spark, spark_days, show_subtitle, show_hot,
    show_stat_downloads, show_stat_week, show_stat_third, show_footer, show_image,
    accent_color, bg_color, text_color
  );

-- Official game-update news posts, scraped weekly from the RuneScape wikis'
-- Category:Game updates listings (see packages/ingest/src/wikiUpdates.ts).
-- Surfaced on plugin trend charts as reference markers so a download spike
-- or crash can be explained instead of just observed. Keyed by the wiki's
-- own page id (not a slug) so a later title edit on-wiki doesn't orphan the
-- row -- (game, wiki_page_id) is upserted in place instead.
CREATE TABLE IF NOT EXISTS game_updates (
  id SERIAL PRIMARY KEY,
  game TEXT NOT NULL,
  wiki_page_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  update_date DATE NOT NULL,
  url TEXT NOT NULL,
  wiki_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game, wiki_page_id)
);

CREATE INDEX IF NOT EXISTS game_updates_game_date_idx ON game_updates (game, update_date);

-- Hand-curated date ranges (Leagues seasons, Fresh Start Worlds, betas,
-- etc.) worth flagging on trend charts, from packages/ingest/data/special-
-- events.json -- see that file's README. No unique key / upsert here: the
-- JSON is the source of truth and small (a handful of rows), so every sync
-- just wholesale-replaces this table's contents (see
-- replaceSpecialEvents in queries.ts) rather than tracking per-row
-- identity across edits/renames.
CREATE TABLE IF NOT EXISTS special_events (
  id SERIAL PRIMARY KEY,
  game TEXT NOT NULL,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE special_events ADD COLUMN IF NOT EXISTS url TEXT;

CREATE INDEX IF NOT EXISTS special_events_game_idx ON special_events (game, start_date);

-- Per-plugin release/version history, backfilled once from each game's real
-- upstream source (see packages/ingest/src/backfill-releases.ts) rather than
-- only observed forward-in-time like plugin_snapshots.date_updated:
--   - runescape (mod.io): each mod's /files entries (one per uploaded build).
--   - runelite (plugin-hub): each commit touching plugins/<name> in the
--     runelite/plugin-hub GitHub repo (one per hub re-packaging).
-- source_key is the upstream id for that one release (mod.io file id, or
-- the hub commit sha) so re-running the backfill is a no-op on rows it's
-- already seen, and a later recurring job can safely pick up only new ones.
CREATE TABLE IF NOT EXISTS plugin_releases (
  id SERIAL PRIMARY KEY,
  plugin_id INTEGER NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_key TEXT NOT NULL,
  released_at TIMESTAMPTZ NOT NULL,
  version TEXT,
  changelog TEXT,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plugin_id, source, source_key)
);

-- The plugin-hub bot has non-content commits ("disable X"/"unavailable X")
-- that pull a broken plugin from the hub listing, not a real version update
-- -- still worth recording (so "unavailable -> available again" is
-- reconstructable later) but not something a trend chart should show as a
-- Release/Update marker. mod.io releases are always 'update' -- every
-- uploaded file there is a real version. See packages/ingest/src/
-- pluginHubReleases.ts for how 'unavailable' gets classified.
ALTER TABLE plugin_releases ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'update';

CREATE INDEX IF NOT EXISTS plugin_releases_plugin_idx ON plugin_releases (plugin_id, released_at);
