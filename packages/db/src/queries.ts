import { randomBytes } from "crypto";
import { getPool } from "./client";
import type {
  AuthorLeaderboardRow,
  AuthorProfile,
  CategoryStat,
  CategoryStatsPage,
  CoAuthor,
  CompareItem,
  CompareMetric,
  CompareRange,
  CompareResult,
  CompareType,
  EmbedCardConfig,
  EmbedCardOptions,
  EmbedCardType,
  FastestGrowingPlugin,
  GrowthSparkRow,
  IngestedMod,
  NewestPluginRow,
  NewReleaseRow,
  Period,
  PluginLeaderboardRow,
  PluginTrendPoint,
  SearchResult,
  SiteStats,
  StatsOverview,
} from "./types";

// Mints (once) and reuses a stable surrogate integer id for an entity that
// has no native numeric id upstream -- e.g. a RuneLite plugin keyed by its
// internalName, or an author keyed by GitHub login. The sequence starts
// at 900,000,000, well clear of mod.io's own 6-8 digit ids, so the two
// namespaces never collide and every existing `Number(id)` code path
// keeps working regardless of which game a plugin belongs to.
export async function getOrCreateExternalId(game: string, kind: "plugin" | "author", externalKey: string): Promise<number> {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM external_id_map WHERE game = $1 AND kind = $2 AND external_key = $3`, [
    game,
    kind,
    externalKey,
  ]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const { rows } = await pool.query(
    `INSERT INTO external_id_map (game, kind, external_key, id)
     VALUES ($1, $2, $3, nextval('external_id_seq'))
     ON CONFLICT (game, kind, external_key) DO UPDATE SET id = external_id_map.id
     RETURNING id`,
    [game, kind, externalKey],
  );
  return rows[0].id;
}

// So an ingest script can skip re-resolving expensive per-entity metadata
// (e.g. RuneLite's GitHub repo lookup) for plugins it has already seen.
export async function getExistingNameIds(game: string): Promise<Set<string>> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT name_id FROM plugins WHERE game = $1`, [game]);
  return new Set(rows.map((r) => r.name_id));
}

export async function getLatestSnapshotTime(game?: string): Promise<string | null> {
  const pool = getPool();
  const { rows } = game
    ? await pool.query(
        `SELECT max(s.captured_at) AS latest FROM plugin_snapshots s JOIN plugins p ON p.id = s.plugin_id WHERE p.game = $1`,
        [game],
      )
    : await pool.query(`SELECT max(captured_at) AS latest FROM plugin_snapshots`);
  return rows[0]?.latest ? rows[0].latest.toISOString() : null;
}

function generateShortId(): string {
  return randomBytes(6).toString("base64url");
}

// Reuses an existing short id for the same (type, entity, options) combo
// instead of minting a new one every time the embed builder re-sends the
// same settings.
export async function createOrGetEmbedCard(type: EmbedCardType, entityId: number, options: EmbedCardOptions): Promise<string> {
  const pool = getPool();
  const params = [
    type,
    entityId,
    options.theme,
    options.spark,
    options.sparkDays,
    options.showSubtitle,
    options.showHot,
    options.showStatDownloads,
    options.showStatWeek,
    options.showStatThird,
    options.showFooter,
    options.showImage,
    options.accentColor,
    options.bgColor,
    options.textColor,
  ];
  const existing = await pool.query(
    `SELECT id FROM embed_cards
     WHERE type = $1 AND entity_id = $2 AND theme = $3 AND spark = $4 AND spark_days = $5
       AND show_subtitle = $6 AND show_hot = $7
       AND show_stat_downloads = $8 AND show_stat_week = $9 AND show_stat_third = $10
       AND show_footer = $11 AND show_image = $12
       AND accent_color = $13 AND bg_color = $14 AND text_color = $15`,
    params,
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = generateShortId();
    try {
      await pool.query(
        `INSERT INTO embed_cards (
           id, type, entity_id, theme, spark, spark_days, show_subtitle, show_hot,
           show_stat_downloads, show_stat_week, show_stat_third, show_footer, show_image,
           accent_color, bg_color, text_color
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [id, ...params],
      );
      return id;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") continue;
      throw err;
    }
  }
  throw new Error("failed to generate a unique embed card id");
}

export async function getEmbedCard(id: string): Promise<EmbedCardConfig | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, type, entity_id, theme, spark, spark_days, show_subtitle, show_hot,
            show_stat_downloads, show_stat_week, show_stat_third, show_footer, show_image,
            accent_color, bg_color, text_color
     FROM embed_cards WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    type: row.type,
    entityId: row.entity_id,
    theme: row.theme,
    spark: row.spark,
    sparkDays: row.spark_days,
    showSubtitle: row.show_subtitle,
    showHot: row.show_hot,
    showStatDownloads: row.show_stat_downloads,
    showStatWeek: row.show_stat_week,
    showStatThird: row.show_stat_third,
    showFooter: row.show_footer,
    showImage: row.show_image,
    accentColor: row.accent_color,
    bgColor: row.bg_color,
    textColor: row.text_color,
  };
}

export async function getRandomPluginId(game = "rs3"): Promise<number | null> {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT id FROM plugins WHERE game = $1 ORDER BY random() LIMIT 1`, [game]);
  return rows[0]?.id ?? null;
}

// Newest plugins first -- unlike the leaderboards, this intentionally
// includes everything (no library-tag exclusion) since it's about
// discoverability, not ranking fairness.
export async function getNewestPlugins(limit = 50, game = "rs3"): Promise<NewestPluginRow[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.id, p.name_id, p.name, p.author_id, p.author_name, p.profile_url, p.tags, p.logo_url, p.date_added, l.downloads_total
     FROM plugins p
     JOIN LATERAL (
       SELECT downloads_total FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1
     ) l ON true
     WHERE p.game = $2
     ORDER BY p.date_added DESC
     LIMIT $1`,
    [limit, game],
  );
  return rows.map((row) => ({
    id: row.id,
    nameId: row.name_id,
    name: row.name,
    authorId: row.author_id,
    authorName: row.author_name,
    profileUrl: row.profile_url,
    tags: row.tags ?? [],
    logoUrl: row.logo_url,
    dateAdded: row.date_added.toISOString(),
    downloadsTotal: Number(row.downloads_total),
  }));
}

export async function getSiteStats(game = "rs3"): Promise<SiteStats> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM plugins WHERE game = $1) AS plugin_count,
       (SELECT count(DISTINCT author_id)::int FROM plugins WHERE game = $1) AS author_count,
       (SELECT COALESCE(SUM(l.downloads_total), 0)::bigint
          FROM plugins p
          JOIN LATERAL (SELECT downloads_total FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1) l ON true
          WHERE p.game = $1
       ) AS downloads_total,
       (SELECT COALESCE(SUM(l.subscribers_total), 0)::bigint
          FROM plugins p
          JOIN LATERAL (SELECT subscribers_total FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1) l ON true
          WHERE p.game = $1
       ) AS subscribers_total,
       (SELECT max(s.captured_at) FROM plugin_snapshots s JOIN plugins p ON p.id = s.plugin_id WHERE p.game = $1) AS updated_at`,
    [game],
  );
  const row = rows[0];
  return {
    pluginCount: row.plugin_count,
    authorCount: row.author_count,
    downloadsTotal: Number(row.downloads_total),
    subscribersTotal: Number(row.subscribers_total),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

export async function upsertPluginsAndSnapshot(mods: IngestedMod[], capturedAt: Date): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const mod of mods) {
      await client.query(
        `INSERT INTO plugins (id, game, name_id, name, author_id, author_name, author_profile_url, author_avatar_url, profile_url, tags, logo_url, summary, ratings_total, ratings_positive, ratings_negative, ratings_percentage_positive, ratings_display_text, date_added, date_updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, to_timestamp($18), to_timestamp($19))
         ON CONFLICT (id) DO UPDATE SET
           name_id = EXCLUDED.name_id,
           name = EXCLUDED.name,
           author_id = EXCLUDED.author_id,
           author_name = EXCLUDED.author_name,
           author_profile_url = EXCLUDED.author_profile_url,
           author_avatar_url = EXCLUDED.author_avatar_url,
           profile_url = EXCLUDED.profile_url,
           tags = EXCLUDED.tags,
           logo_url = EXCLUDED.logo_url,
           summary = EXCLUDED.summary,
           ratings_total = EXCLUDED.ratings_total,
           ratings_positive = EXCLUDED.ratings_positive,
           ratings_negative = EXCLUDED.ratings_negative,
           ratings_percentage_positive = EXCLUDED.ratings_percentage_positive,
           ratings_display_text = EXCLUDED.ratings_display_text,
           date_updated = EXCLUDED.date_updated`,
        [
          mod.id,
          mod.game,
          mod.nameId,
          mod.name,
          mod.authorId,
          mod.authorName,
          mod.authorProfileUrl,
          mod.authorAvatarUrl,
          mod.profileUrl,
          mod.tags,
          mod.logoUrl,
          mod.summary,
          mod.ratingsTotal,
          mod.ratingsPositive,
          mod.ratingsNegative,
          mod.ratingsPercentagePositive,
          mod.ratingsDisplayText,
          mod.dateAdded,
          mod.dateUpdated,
        ],
      );
      await client.query(
        `INSERT INTO plugin_snapshots (plugin_id, captured_at, downloads_total, downloads_today, subscribers_total, popularity_rank_position)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (plugin_id, captured_at) DO NOTHING`,
        [mod.id, capturedAt, mod.downloadsTotal, mod.downloadsToday, mod.subscribersTotal, mod.popularityRankPosition],
      );

      // Replace the roster wholesale each run -- cheap at this scale and
      // avoids tracking additions/removals/reordering between ingests.
      await client.query(`DELETE FROM plugin_authors WHERE plugin_id = $1`, [mod.id]);
      for (let i = 0; i < mod.coAuthors.length; i++) {
        const co = mod.coAuthors[i];
        await client.query(
          `INSERT INTO plugin_authors (plugin_id, author_id, author_name, author_avatar_url, author_profile_url, position)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (plugin_id, author_id) DO UPDATE SET
             author_name = EXCLUDED.author_name,
             author_avatar_url = EXCLUDED.author_avatar_url,
             author_profile_url = EXCLUDED.author_profile_url,
             position = EXCLUDED.position`,
          [mod.id, co.authorId, co.name, co.avatarUrl, co.profileUrl, i],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Plugins tagged as libraries for other plugins are excluded from
// leaderboard rankings -- their download counts are inflated by being
// pulled in as a dependency rather than installed for their own sake.
const LEADERBOARD_EXCLUDED_TAG = "Library for other Plugins";

// Latest snapshot per plugin, ordered by the requested metric.
async function topPluginsByLatestMetric(metric: "downloads_total" | "downloads_today", game: string, limit: number): Promise<PluginLeaderboardRow[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.id, p.name_id, p.name, p.author_id, p.author_name, p.profile_url, p.tags, l.${metric} AS value
     FROM plugins p
     JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1
     ) l ON true
     WHERE p.game = $3 AND NOT ($2 = ANY(p.tags))
     ORDER BY value DESC
     LIMIT $1`,
    [limit, LEADERBOARD_EXCLUDED_TAG, game],
  );
  return rows.map(toPluginRow);
}

// Downloads gained between the latest snapshot and the nearest snapshot at
// or before the cutoff, falling back to the earliest snapshot when less
// than `cutoffDays` of history exists yet.
async function topPluginsByGain(cutoffDays: number, game: string, limit: number): Promise<PluginLeaderboardRow[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.id, p.name_id, p.name, p.author_id, p.author_name, p.profile_url, p.tags,
            l.downloads_total - COALESCE(b1.downloads_total, b2.downloads_total, l.downloads_total) AS value
     FROM plugins p
     JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1
     ) l ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id AND s.captured_at <= now() - ($2 * interval '1 day')
       ORDER BY s.captured_at DESC LIMIT 1
     ) b1 ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at ASC LIMIT 1
     ) b2 ON true
     WHERE p.game = $4 AND NOT ($3 = ANY(p.tags))
     ORDER BY value DESC
     LIMIT $1`,
    [limit, cutoffDays, LEADERBOARD_EXCLUDED_TAG, game],
  );
  return rows.map(toPluginRow);
}

// Ranks by growth *rate* rather than raw gain, so a small plugin that
// doubled its downloads ranks above a huge plugin that gained more in
// absolute terms. Denominators are clamped to a floor so brand-new
// plugins with a near-zero baseline don't produce absurd percentages.
export async function getFastestGrowingPlugins(limit = 5, cutoffDays = 7, game = "rs3"): Promise<FastestGrowingPlugin[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.id, p.name_id, p.name, p.author_id, p.author_name, p.profile_url,
            l.downloads_total AS downloads_total,
            l.subscribers_total AS subscribers_total,
            (l.downloads_total - COALESCE(b1.downloads_total, b2.downloads_total, l.downloads_total)) AS downloads_gain,
            (l.subscribers_total - COALESCE(b1.subscribers_total, b2.subscribers_total, l.subscribers_total)) AS subscribers_gain,
            (l.downloads_total - COALESCE(b1.downloads_total, b2.downloads_total, l.downloads_total))::float
              / GREATEST(COALESCE(b1.downloads_total, b2.downloads_total, l.downloads_total), 1) * 100 AS downloads_growth_pct,
            (
              (l.downloads_total - COALESCE(b1.downloads_total, b2.downloads_total, l.downloads_total))::float
                / GREATEST(COALESCE(b1.downloads_total, b2.downloads_total, l.downloads_total), 20)
              +
              (l.subscribers_total - COALESCE(b1.subscribers_total, b2.subscribers_total, l.subscribers_total))::float
                / GREATEST(COALESCE(b1.subscribers_total, b2.subscribers_total, l.subscribers_total), 10)
            ) AS growth_score
     FROM plugins p
     JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1
     ) l ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id AND s.captured_at <= now() - ($2 * interval '1 day')
       ORDER BY s.captured_at DESC LIMIT 1
     ) b1 ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at ASC LIMIT 1
     ) b2 ON true
     WHERE p.game = $4 AND NOT ($3 = ANY(p.tags))
     ORDER BY growth_score DESC
     LIMIT $1`,
    [limit, cutoffDays, LEADERBOARD_EXCLUDED_TAG, game],
  );
  return rows
    .map((row) => ({
      id: row.id,
      nameId: row.name_id,
      name: row.name,
      authorId: row.author_id,
      authorName: row.author_name,
      profileUrl: row.profile_url,
      downloadsTotal: Number(row.downloads_total),
      subscribersTotal: Number(row.subscribers_total),
      downloadsGain: Number(row.downloads_gain),
      subscribersGain: Number(row.subscribers_gain),
      downloadsGrowthPct: Number(row.downloads_growth_pct),
      growthScore: Number(row.growth_score),
    }))
    .filter((p) => p.growthScore > 0);
}

export async function getTopPlugins(period: Period, limit = 50, game = "rs3"): Promise<PluginLeaderboardRow[]> {
  if (period === "alltime") return topPluginsByLatestMetric("downloads_total", game, limit);
  if (period === "hot") return topPluginsByLatestMetric("downloads_today", game, limit);
  if (period === "weekly") return topPluginsByGain(7, game, limit);
  return topPluginsByGain(30, game, limit);
}

export async function getTopAuthors(period: Period, limit = 50, game = "rs3"): Promise<AuthorLeaderboardRow[]> {
  const plugins = await getTopPlugins(period, 10000, game);
  const byAuthor = new Map<number, AuthorLeaderboardRow>();
  for (const plugin of plugins) {
    const existing = byAuthor.get(plugin.authorId);
    if (existing) {
      existing.value += plugin.value;
      existing.pluginCount += 1;
    } else {
      byAuthor.set(plugin.authorId, {
        authorId: plugin.authorId,
        authorName: plugin.authorName,
        pluginCount: 1,
        value: plugin.value,
      });
    }
  }
  return Array.from(byAuthor.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// Trending fallback for an empty query, plus a name/author substring
// match for a real one, always ranked by total downloads -- the most
// popular match leads regardless of *why* it matched. Authors are
// aggregated via plugin_authors so a co-author's search hit counts every
// plugin they're credited on, not just plugins.author_id.
export async function searchPluginsAndAuthors(
  game: string,
  query: string,
  pluginLimit = 6,
  authorLimit = 4,
): Promise<SearchResult> {
  const q = query.trim();
  const pool = getPool();

  if (!q) {
    // Trending counts are fixed regardless of the caller's limit -- the
    // header search always shows "top 5 plugins + top 3 authors" when idle.
    const [plugins, authors] = await Promise.all([
      getTopPlugins("weekly", 5, game),
      getTopAuthors("weekly", 3, game),
    ]);
    const [pluginAvatars, authorAvatars] = await Promise.all([
      getPluginAvatars(pool, plugins.map((p) => p.id)),
      getAuthorAvatars(pool, authors.map((a) => a.authorId)),
    ]);
    return {
      plugins: plugins.map((p) => ({
        id: p.id,
        name: p.name,
        author: p.authorName,
        authorAvatarUrl: pluginAvatars.get(p.id) ?? null,
        total: p.value,
      })),
      authors: authors.map((a) => ({
        id: a.authorId,
        name: a.authorName,
        avatarUrl: authorAvatars.get(a.authorId) ?? null,
        pluginCount: a.pluginCount,
        total: a.value,
      })),
    };
  }

  // Match quality still gates *which* rows qualify (see the WHERE clauses
  // below), but the highest-ranked (most downloaded) match always sorts
  // first within those -- a popular plugin found via its author's name
  // should outrank an obscure exact-name match.
  const pluginsResult = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (s.plugin_id) s.plugin_id, s.downloads_total
       FROM plugin_snapshots s
       ORDER BY s.plugin_id, s.captured_at DESC
     )
     SELECT p.id, p.name, p.author_name, p.author_avatar_url, l.downloads_total AS total
     FROM plugins p
     JOIN latest l ON l.plugin_id = p.id
     WHERE p.game = $2
       AND NOT ($3 = ANY(p.tags))
       AND (
         p.name ILIKE '%' || $1 || '%'
         OR EXISTS (
           SELECT 1 FROM plugin_authors pa WHERE pa.plugin_id = p.id AND pa.author_name ILIKE '%' || $1 || '%'
         )
       )
     ORDER BY total DESC
     LIMIT $4`,
    [q, game, LEADERBOARD_EXCLUDED_TAG, pluginLimit],
  );

  const authorsResult = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (s.plugin_id) s.plugin_id, s.downloads_total
       FROM plugin_snapshots s
       ORDER BY s.plugin_id, s.captured_at DESC
     ),
     agg AS (
       SELECT pa.author_id, MAX(pa.author_name) AS author_name, MAX(pa.author_avatar_url) AS author_avatar_url,
              COUNT(DISTINCT pa.plugin_id) AS plugin_count, SUM(l.downloads_total) AS total
       FROM plugin_authors pa
       JOIN plugins p ON p.id = pa.plugin_id
       JOIN latest l ON l.plugin_id = p.id
       WHERE p.game = $2 AND NOT ($3 = ANY(p.tags))
       GROUP BY pa.author_id
     )
     SELECT author_id, author_name, author_avatar_url, plugin_count, total
     FROM agg
     WHERE author_name ILIKE '%' || $1 || '%'
     ORDER BY total DESC
     LIMIT $4`,
    [q, game, LEADERBOARD_EXCLUDED_TAG, authorLimit],
  );

  return {
    plugins: pluginsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      author: row.author_name,
      authorAvatarUrl: row.author_avatar_url,
      total: Number(row.total),
    })),
    authors: authorsResult.rows.map((row) => ({
      id: row.author_id,
      name: row.author_name,
      avatarUrl: row.author_avatar_url,
      pluginCount: Number(row.plugin_count),
      total: Number(row.total),
    })),
  };
}

async function getPluginAvatars(pool: ReturnType<typeof getPool>, ids: number[]): Promise<Map<number, string | null>> {
  if (ids.length === 0) return new Map();
  const { rows } = await pool.query(`SELECT id, author_avatar_url FROM plugins WHERE id = ANY($1)`, [ids]);
  return new Map(rows.map((row) => [row.id, row.author_avatar_url]));
}

async function getAuthorAvatars(pool: ReturnType<typeof getPool>, ids: number[]): Promise<Map<number, string | null>> {
  if (ids.length === 0) return new Map();
  const { rows } = await pool.query(
    `SELECT author_id, MAX(author_avatar_url) AS author_avatar_url FROM plugin_authors WHERE author_id = ANY($1) GROUP BY author_id`,
    [ids],
  );
  return new Map(rows.map((row) => [row.author_id, row.author_avatar_url]));
}

export interface PluginMeta {
  id: number;
  game: string;
  nameId: string;
  name: string;
  authorId: number;
  authorName: string;
  authorAvatarUrl: string | null;
  coAuthors: CoAuthor[];
  profileUrl: string;
  tags: string[];
  logoUrl: string | null;
  summary: string;
  ratingsTotal: number;
  ratingsPositive: number;
  ratingsNegative: number;
  ratingsPercentagePositive: number;
  ratingsDisplayText: string;
  dateAdded: string;
  dateUpdated: string;
}

export async function getPluginCoAuthors(pluginId: number): Promise<CoAuthor[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT author_id, author_name, author_avatar_url, author_profile_url
     FROM plugin_authors WHERE plugin_id = $1 ORDER BY position ASC`,
    [pluginId],
  );
  return rows.map((row) => ({
    authorId: row.author_id,
    name: row.author_name,
    avatarUrl: row.author_avatar_url,
    profileUrl: row.author_profile_url,
  }));
}

export async function getPlugin(pluginId: number): Promise<PluginMeta | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, game, name_id, name, author_id, author_name, author_avatar_url, profile_url, tags, logo_url, summary,
            ratings_total, ratings_positive, ratings_negative, ratings_percentage_positive, ratings_display_text,
            date_added, date_updated
     FROM plugins WHERE id = $1`,
    [pluginId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  const coAuthors = await getPluginCoAuthors(pluginId);
  return {
    id: row.id,
    game: row.game,
    nameId: row.name_id,
    name: row.name,
    authorId: row.author_id,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    coAuthors,
    profileUrl: row.profile_url,
    tags: row.tags ?? [],
    logoUrl: row.logo_url,
    summary: row.summary,
    ratingsTotal: row.ratings_total,
    ratingsPositive: row.ratings_positive,
    ratingsNegative: row.ratings_negative,
    ratingsPercentagePositive: row.ratings_percentage_positive,
    ratingsDisplayText: row.ratings_display_text,
    dateAdded: row.date_added.toISOString(),
    dateUpdated: row.date_updated.toISOString(),
  };
}

export async function getPluginTrend(pluginId: number): Promise<PluginTrendPoint[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT captured_at, downloads_total, downloads_today, subscribers_total
     FROM plugin_snapshots WHERE plugin_id = $1 ORDER BY captured_at ASC`,
    [pluginId],
  );
  return rows.map((row) => ({
    capturedAt: row.captured_at.toISOString(),
    downloadsTotal: row.downloads_total,
    downloadsToday: row.downloads_today,
    subscribersTotal: row.subscribers_total,
  }));
}

function toPluginRow(row: any): PluginLeaderboardRow {
  return {
    id: row.id,
    nameId: row.name_id,
    name: row.name,
    authorId: row.author_id,
    authorName: row.author_name,
    profileUrl: row.profile_url,
    tags: row.tags ?? [],
    value: Number(row.value),
  };
}

export async function getAuthorProfile(authorId: number): Promise<AuthorProfile | null> {
  const pool = getPool();
  // Joined via plugin_authors (not plugins.author_id directly) so a
  // co-author's page picks up every plugin they're credited on, not just
  // ones where they happen to be the primary/first-listed author.
  const { rows } = await pool.query(
    `SELECT p.id, p.game, p.name_id, p.name, p.date_added,
            pa.author_name, pa.author_profile_url, pa.author_avatar_url,
            l.downloads_total, l.downloads_today, l.subscribers_total,
            l.downloads_total - COALESCE(b1.downloads_total, b2.downloads_total, l.downloads_total) AS weekly_gain
     FROM plugin_authors pa
     JOIN plugins p ON p.id = pa.plugin_id
     JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1
     ) l ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id AND s.captured_at <= now() - interval '7 days'
       ORDER BY s.captured_at DESC LIMIT 1
     ) b1 ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at ASC LIMIT 1
     ) b2 ON true
     WHERE pa.author_id = $1
     ORDER BY l.downloads_total DESC`,
    [authorId],
  );

  if (rows.length === 0) return null;
  const game = rows[0].game;

  const [hotPlugins, allTimeAuthors, hotAuthors, weeklyAuthors] = await Promise.all([
    getTopPlugins("hot", 10, game),
    getTopAuthors("alltime", 10000, game),
    getTopAuthors("hot", 10000, game),
    getTopAuthors("weekly", 10000, game),
  ]);
  const hotPluginIds = new Set(hotPlugins.map((p) => p.id));
  const rankOf = (list: AuthorLeaderboardRow[]) => {
    const index = list.findIndex((a) => a.authorId === authorId);
    return index === -1 ? null : index + 1;
  };

  const plugins = rows.map((row) => ({
    id: row.id,
    nameId: row.name_id,
    name: row.name,
    dateAdded: row.date_added.toISOString(),
    downloadsTotal: Number(row.downloads_total),
    weeklyGain: Number(row.weekly_gain),
    subscribersTotal: Number(row.subscribers_total),
    hot: hotPluginIds.has(row.id),
  }));

  return {
    authorId,
    game,
    authorName: rows[0].author_name,
    authorProfileUrl: rows[0].author_profile_url,
    authorAvatarUrl: rows[0].author_avatar_url,
    pluginCount: plugins.length,
    publishingSince: rows.reduce((min, r) => (r.date_added < min ? r.date_added : min), rows[0].date_added).toISOString(),
    totals: {
      downloadsTotal: rows.reduce((sum, r) => sum + Number(r.downloads_total), 0),
      downloadsToday: rows.reduce((sum, r) => sum + Number(r.downloads_today), 0),
      weeklyGain: rows.reduce((sum, r) => sum + Number(r.weekly_gain), 0),
      subscribersTotal: rows.reduce((sum, r) => sum + Number(r.subscribers_total), 0),
    },
    ranks: {
      allTime: rankOf(allTimeAuthors),
      hotToday: rankOf(hotAuthors),
      hotWeek: rankOf(weeklyAuthors),
    },
    plugins,
  };
}

interface DailySeriesPoint {
  date: string;
  total: number;
  today: number;
  subs: number;
}

function daysAgoDate(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function addDaysDate(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 7-day rolling average with a partial window at the start of the series
// (averages over whatever's available for the first 6 days) so short
// histories still render a line instead of starting blank.
function rollingAvg7(values: number[]): number[] {
  const out = new Array<number>(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= 7) sum -= values[i - 7];
    out[i] = sum / Math.min(i + 1, 7);
  }
  return out;
}

// Forward-fills each plugin's most recent snapshot onto every day in the
// range (one row per plugin per day, last-value-of-day semantics) so the
// daily totals/today/subs series has no gaps even when ingest runs
// irregularly rather than on a strict daily cron.
async function getDailySeriesByPlugin(
  pluginIds: number[] | null,
  fromDate: Date,
  toDate: Date,
  game = "rs3",
): Promise<Map<number, DailySeriesPoint[]>> {
  const pool = getPool();
  const { rows } = await pool.query(
    `WITH days AS (
       SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
     )
     SELECT d.day, p.id AS plugin_id,
            COALESCE(l.downloads_total, 0) AS downloads_total,
            COALESCE(l.downloads_today, 0) AS downloads_today,
            COALESCE(l.subscribers_total, 0) AS subscribers_total
     FROM days d
     CROSS JOIN plugins p
     LEFT JOIN LATERAL (
       SELECT downloads_total, downloads_today, subscribers_total
       FROM plugin_snapshots s
       WHERE s.plugin_id = p.id AND s.captured_at < d.day + interval '1 day'
       ORDER BY s.captured_at DESC LIMIT 1
     ) l ON true
     WHERE ($3::int[] IS NULL OR p.id = ANY($3::int[])) AND p.game = $4
     ORDER BY p.id, d.day`,
    [toDateKey(fromDate), toDateKey(toDate), pluginIds, game],
  );

  const map = new Map<number, DailySeriesPoint[]>();
  for (const row of rows) {
    const list = map.get(row.plugin_id) ?? [];
    list.push({
      date: toDateKey(row.day),
      total: Number(row.downloads_total),
      today: Number(row.downloads_today),
      subs: Number(row.subscribers_total),
    });
    map.set(row.plugin_id, list);
  }
  return map;
}

function sumDailySeries(lists: DailySeriesPoint[][]): DailySeriesPoint[] {
  const longest = lists.reduce((best, l) => (l.length > best.length ? l : best), lists[0] ?? []);
  return longest.map((point, i) => ({
    date: point.date,
    total: lists.reduce((sum, l) => sum + (l[i]?.total ?? 0), 0),
    today: lists.reduce((sum, l) => sum + (l[i]?.today ?? 0), 0),
    subs: lists.reduce((sum, l) => sum + (l[i]?.subs ?? 0), 0),
  }));
}

function extractMetricSeries(series: DailySeriesPoint[], metric: CompareMetric, padCount = 0): number[] {
  if (metric === "total") return series.slice(padCount).map((p) => p.total);
  if (metric === "subs") return series.slice(padCount).map((p) => p.subs);
  return rollingAvg7(series.map((p) => p.today)).slice(padCount);
}

// The aggregation itself is cheap (tag cloud is at most a few thousand
// rows, grouped in one pass) -- the actual cost this avoids is shipping
// *all* of them to the client on every stats-overview load just to show
// 10 at a time. So we still aggregate the full list in Postgres, then
// paginate in JS before it ever gets serialized into a response body.
async function getAllCategoryStats(game: string): Promise<CategoryStat[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT tag,
            count(*)::int AS plugin_count,
            SUM(l.downloads_total)::bigint AS downloads_total,
            SUM(l.downloads_total - COALESCE(b1.downloads_total, b2.downloads_total, l.downloads_total))::bigint AS week_gain
     FROM plugins p, unnest(p.tags) AS tag
     JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1
     ) l ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id AND s.captured_at <= now() - interval '7 days'
       ORDER BY s.captured_at DESC LIMIT 1
     ) b1 ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at ASC LIMIT 1
     ) b2 ON true
     WHERE p.game = $1
     GROUP BY tag
     ORDER BY downloads_total DESC`,
    [game],
  );
  return rows.map((row) => ({
    name: row.tag,
    pluginCount: row.plugin_count,
    downloadsTotal: Number(row.downloads_total),
    weekGain: Number(row.week_gain),
  }));
}

export async function getCategoryStatsPage(game: string, page: number, pageSize: number): Promise<CategoryStatsPage> {
  const all = await getAllCategoryStats(game);
  const offset = (page - 1) * pageSize;
  return {
    categories: all.slice(offset, offset + pageSize),
    total: all.length,
    maxDownloads: all.length > 0 ? all[0].downloadsTotal : 0,
  };
}

// Growth rate (not raw gain): this week's gain vs the week before it, so a
// small plugin that doubled ranks above a huge plugin with a bigger
// absolute gain. Requires snapshots at both the 7d and 14d marks (i.e. the
// plugin is at least 14 days old) and a previous-week floor of 50
// downloads so brand-new/tiny plugins don't produce absurd percentages.
async function getFastestGrowingWithSpark(limit: number, game: string): Promise<GrowthSparkRow[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.author_id, p.author_name,
            l.downloads_total AS total_now,
            b7.downloads_total AS total_7,
            b14.downloads_total AS total_14
     FROM plugins p
     JOIN LATERAL (SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1) l ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id AND s.captured_at <= now() - interval '7 days'
       ORDER BY s.captured_at DESC LIMIT 1
     ) b7 ON true
     LEFT JOIN LATERAL (
       SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id AND s.captured_at <= now() - interval '14 days'
       ORDER BY s.captured_at DESC LIMIT 1
     ) b14 ON true
     WHERE p.game = $1 AND b7.downloads_total IS NOT NULL AND b14.downloads_total IS NOT NULL`,
    [game],
  );

  const candidates = rows
    .map((row) => {
      const thisWeek = Number(row.total_now) - Number(row.total_7);
      const prevWeek = Number(row.total_7) - Number(row.total_14);
      return { row, growthPct: (thisWeek / prevWeek - 1) * 100, prevWeek };
    })
    .filter((c) => c.prevWeek >= 50)
    .sort((a, b) => b.growthPct - a.growthPct)
    .slice(0, limit);

  if (candidates.length === 0) return [];

  const ids = candidates.map((c) => c.row.id);
  const sparkMap = await getDailySeriesByPlugin(ids, daysAgoDate(13), daysAgoDate(0), game);

  return candidates.map((c) => ({
    id: c.row.id,
    name: c.row.name,
    authorId: c.row.author_id,
    authorName: c.row.author_name,
    growthPct: Math.round(c.growthPct),
    spark: (sparkMap.get(c.row.id) ?? []).map((p) => p.today),
  }));
}

async function getNewReleases(limit: number, withinDays: number, game: string): Promise<NewReleaseRow[]> {
  const pool = getPool();
  const recentQuery = `SELECT p.id, p.name, p.author_id, p.author_name, p.date_added, l.downloads_total
     FROM plugins p
     JOIN LATERAL (SELECT downloads_total FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1) l ON true
     WHERE p.game = $3 AND p.date_added >= now() - ($2 * interval '1 day')
     ORDER BY p.date_added DESC
     LIMIT $1`;
  let { rows } = await pool.query(recentQuery, [limit, withinDays, game]);

  if (rows.length < 3) {
    ({ rows } = await pool.query(
      `SELECT p.id, p.name, p.author_id, p.author_name, p.date_added, l.downloads_total
       FROM plugins p
       JOIN LATERAL (SELECT downloads_total FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1) l ON true
       WHERE p.game = $2
       ORDER BY p.date_added DESC
       LIMIT $1`,
      [limit, game],
    ));
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    authorId: row.author_id,
    authorName: row.author_name,
    dateAdded: row.date_added.toISOString(),
    downloadsTotal: Number(row.downloads_total),
  }));
}

// Site-wide per-day totals, summed across every plugin in the game --
// getStatsOverview only ever needs these sums, never a per-plugin
// breakdown, so unlike getDailySeriesByPlugin (used by compare, which
// needs each plugin's own series) this avoids materializing a
// day-by-plugin grid with a correlated "latest snapshot" lookup per cell.
// That grid is O(days * plugins), which stops being cheap once a game has
// thousands of plugins and a 90+ day window; this is O(plugins +
// snapshots-in-range + days) instead -- one lateral lookup per plugin for
// the pre-range seed value, then a plain indexed range scan for in-range
// snapshots, applying each as a delta to a running total.
async function getDailyTotalsAllPlugins(fromDate: Date, toDate: Date, game: string): Promise<{ totalsByDay: number[]; todayByDay: number[] }> {
  const pool = getPool();
  const fromKey = toDateKey(fromDate);
  const toKey = toDateKey(toDate);
  const padDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;

  const [{ rows: seedRows }, { rows: rangeRows }] = await Promise.all([
    pool.query(
      `SELECT p.id AS plugin_id, s.downloads_total, s.downloads_today
       FROM plugins p
       JOIN LATERAL (
         SELECT downloads_total, downloads_today FROM plugin_snapshots s
         WHERE s.plugin_id = p.id AND s.captured_at < $1::date
         ORDER BY s.captured_at DESC LIMIT 1
       ) s ON true
       WHERE p.game = $2`,
      [fromKey, game],
    ),
    pool.query(
      `SELECT s.plugin_id, s.captured_at::date AS day, s.downloads_total, s.downloads_today
       FROM plugin_snapshots s
       JOIN plugins p ON p.id = s.plugin_id
       WHERE p.game = $1 AND s.captured_at >= $2::date AND s.captured_at < $3::date + interval '1 day'
       ORDER BY s.captured_at ASC`,
      [game, fromKey, toKey],
    ),
  ]);

  const current = new Map<number, { total: number; today: number }>();
  let runningTotal = 0;
  let runningToday = 0;
  for (const row of seedRows) {
    const total = Number(row.downloads_total);
    const today = Number(row.downloads_today);
    current.set(row.plugin_id, { total, today });
    runningTotal += total;
    runningToday += today;
  }

  const totalsByDay = new Array<number>(padDays).fill(0);
  const todayByDay = new Array<number>(padDays).fill(0);
  let rowIndex = 0;
  for (let dayIndex = 0; dayIndex < padDays; dayIndex++) {
    const dayKey = toDateKey(addDaysDate(fromDate, dayIndex));
    while (rowIndex < rangeRows.length && toDateKey(rangeRows[rowIndex].day) === dayKey) {
      const row = rangeRows[rowIndex];
      const total = Number(row.downloads_total);
      const today = Number(row.downloads_today);
      const prev = current.get(row.plugin_id);
      runningTotal += total - (prev?.total ?? 0);
      runningToday += today - (prev?.today ?? 0);
      current.set(row.plugin_id, { total, today });
      rowIndex++;
    }
    totalsByDay[dayIndex] = runningTotal;
    todayByDay[dayIndex] = runningToday;
  }

  return { totalsByDay, todayByDay };
}

export async function getStatsOverview(rangeDays: 30 | 90 | 365 = 90, game = "rs3"): Promise<StatsOverview> {
  const pool = getPool();
  const padDays = rangeDays + 6; // extra lookback so the 7-day average is warmed up by day one of the visible range
  const fromDate = daysAgoDate(padDays - 1);
  const toDate = daysAgoDate(0);

  const { totalsByDay, todayByDay } = await getDailyTotalsAllPlugins(fromDate, toDate, game);
  const avg7 = rollingAvg7(todayByDay);
  const dates = Array.from({ length: padDays }, (_, i) => toDateKey(addDaysDate(fromDate, i)));

  const visibleFrom = padDays - rangeDays;
  const daily = dates.slice(visibleFrom).map((date, i) => ({
    date,
    downloads: todayByDay[visibleFrom + i],
    avg7: Math.round(avg7[visibleFrom + i]),
  }));

  const latestTotal = totalsByDay[padDays - 1];
  const weekAgoTotal = totalsByDay[Math.max(0, padDays - 8)];
  const latestToday = todayByDay[padDays - 1];
  const avg7Yesterday = avg7[Math.max(0, padDays - 2)];

  const [pluginCounts, fastestGrowing, newReleases, updatedAt] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS plugins,
              count(*) FILTER (WHERE date_added >= now() - interval '30 days')::int AS plugins_new_30d,
              count(DISTINCT author_id)::int AS authors,
              count(DISTINCT author_id) FILTER (WHERE date_added >= now() - interval '30 days')::int AS authors_released_30d
       FROM plugins WHERE game = $1`,
      [game],
    ),
    getFastestGrowingWithSpark(6, game),
    getNewReleases(5, 60, game),
    getLatestSnapshotTime(game),
  ]);
  const counts = pluginCounts.rows[0];

  return {
    updatedAt,
    totals: {
      downloadsTotal: latestTotal,
      downloadsWeek: latestTotal - weekAgoTotal,
      downloadsToday: latestToday,
      avg7Yesterday: Math.round(avg7Yesterday),
      plugins: counts.plugins,
      pluginsNew30d: counts.plugins_new_30d,
      authors: counts.authors,
      authorsReleased30d: counts.authors_released_30d,
    },
    daily,
    fastestGrowing,
    newReleases,
  };
}

function resolveCompareRange(range: CompareRange, startDates: string[]): { fromDate: Date; toDate: Date } {
  const toDate = daysAgoDate(0);
  if (range === "all") {
    const earliest = startDates.length ? new Date(Math.min(...startDates.map((d) => new Date(d).getTime()))) : daysAgoDate(90);
    earliest.setUTCHours(0, 0, 0, 0);
    return { fromDate: earliest, toDate };
  }
  return { fromDate: daysAgoDate(range - 1), toDate };
}

const COMPARE_STATS_FIELDS = `
     p.id, p.game, p.name, p.author_id, p.author_name, p.date_added,
     l.downloads_total AS total_now, l.downloads_today AS today_now, l.subscribers_total AS subs_now,
     COALESCE(b7.downloads_total, b7f.downloads_total, l.downloads_total) AS total_7,
     COALESCE(b30.downloads_total, b30f.downloads_total, l.downloads_total) AS total_30
   FROM plugins p
   JOIN LATERAL (SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at DESC LIMIT 1) l ON true
   LEFT JOIN LATERAL (SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id AND s.captured_at <= now() - interval '7 days' ORDER BY s.captured_at DESC LIMIT 1) b7 ON true
   LEFT JOIN LATERAL (SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at ASC LIMIT 1) b7f ON true
   LEFT JOIN LATERAL (SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id AND s.captured_at <= now() - interval '30 days' ORDER BY s.captured_at DESC LIMIT 1) b30 ON true
   LEFT JOIN LATERAL (SELECT * FROM plugin_snapshots s WHERE s.plugin_id = p.id ORDER BY s.captured_at ASC LIMIT 1) b30f ON true`;

export async function getCompareData(type: CompareType, keys: number[], metric: CompareMetric, range: CompareRange): Promise<CompareResult> {
  const pool = getPool();
  const padCount = metric === "daily" ? 6 : 0;

  if (type === "plugin") {
    const { rows } = await pool.query(`SELECT ${COMPARE_STATS_FIELDS} WHERE p.id = ANY($1::int[])`, [keys]);
    if (rows.length === 0) return { type, metric, from: "", to: "", items: [] };

    const byId = new Map<number, (typeof rows)[number]>(rows.map((r) => [r.id, r]));
    const orderedKeys = keys.filter((k) => byId.has(k));
    const game = byId.get(orderedKeys[0])!.game;
    const [allTime, hot] = await Promise.all([getTopPlugins("alltime", 10000, game), getTopPlugins("hot", 10000, game)]);
    const rankOf = (list: PluginLeaderboardRow[], id: number) => {
      const i = list.findIndex((p) => p.id === id);
      return i === -1 ? null : i + 1;
    };

    const { fromDate, toDate } = resolveCompareRange(
      range,
      orderedKeys.map((k) => byId.get(k)!.date_added.toISOString()),
    );
    const fetchFrom = padCount ? addDaysDate(fromDate, -padCount) : fromDate;
    const seriesMap = await getDailySeriesByPlugin(orderedKeys, fetchFrom, toDate, game);

    const items: CompareItem[] = orderedKeys.map((id) => {
      const row = byId.get(id)!;
      return {
        key: id,
        name: row.name,
        sub: `by ${row.author_name}`,
        series: extractMetricSeries(seriesMap.get(id) ?? [], metric, padCount),
        stats: {
          all: Number(row.total_now),
          hot: Number(row.today_now),
          week: Number(row.total_now) - Number(row.total_7),
          month: Number(row.total_now) - Number(row.total_30),
          subs: Number(row.subs_now),
          rank: rankOf(allTime, id),
          hotRank: rankOf(hot, id),
          count: null,
          start: row.date_added.toISOString(),
        },
      };
    });

    return { type, metric, from: toDateKey(fromDate), to: toDateKey(toDate), items };
  }

  const { rows: pluginRows } = await pool.query(`SELECT ${COMPARE_STATS_FIELDS} WHERE p.author_id = ANY($1::int[])`, [keys]);
  if (pluginRows.length === 0) return { type, metric, from: "", to: "", items: [] };

  const byAuthor = new Map<number, typeof pluginRows>();
  for (const row of pluginRows) {
    const list = byAuthor.get(row.author_id) ?? [];
    list.push(row);
    byAuthor.set(row.author_id, list);
  }
  const orderedKeys = keys.filter((k) => byAuthor.has(k));
  const startOf = (authorId: number) =>
    byAuthor.get(authorId)!.reduce((min, r) => (r.date_added < min ? r.date_added : min), byAuthor.get(authorId)![0].date_added);
  const game = pluginRows[0].game;

  const allTimeAuthors = await getTopAuthors("alltime", 10000, game);
  const rankOfAuthor = (authorId: number) => {
    const i = allTimeAuthors.findIndex((a) => a.authorId === authorId);
    return i === -1 ? null : i + 1;
  };

  const { fromDate, toDate } = resolveCompareRange(
    range,
    orderedKeys.map((k) => startOf(k).toISOString()),
  );
  const fetchFrom = padCount ? addDaysDate(fromDate, -padCount) : fromDate;
  const allPluginIds = pluginRows.map((r) => r.id);
  const seriesMap = await getDailySeriesByPlugin(allPluginIds, fetchFrom, toDate, game);

  const items: CompareItem[] = orderedKeys.map((authorId) => {
    const plugins = byAuthor.get(authorId)!;
    const sumSeries = sumDailySeries(plugins.map((p) => seriesMap.get(p.id) ?? []));
    const all = plugins.reduce((sum, r) => sum + Number(r.total_now), 0);
    const hotVal = plugins.reduce((sum, r) => sum + Number(r.today_now), 0);
    const week = plugins.reduce((sum, r) => sum + (Number(r.total_now) - Number(r.total_7)), 0);
    const month = plugins.reduce((sum, r) => sum + (Number(r.total_now) - Number(r.total_30)), 0);
    const subs = plugins.reduce((sum, r) => sum + Number(r.subs_now), 0);
    return {
      key: authorId,
      name: plugins[0].author_name,
      sub: `${plugins.length} ${plugins.length === 1 ? "plugin" : "plugins"}`,
      series: extractMetricSeries(sumSeries, metric, padCount),
      stats: {
        all,
        hot: hotVal,
        week,
        month,
        subs,
        rank: rankOfAuthor(authorId),
        hotRank: null,
        count: plugins.length,
        start: startOf(authorId).toISOString(),
      },
    };
  });

  return { type, metric, from: toDateKey(fromDate), to: toDateKey(toDate), items };
}
