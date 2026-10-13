export type Period = "alltime" | "hot" | "weekly" | "monthly";

export interface PluginLeaderboardRow {
  id: number;
  nameId: string;
  name: string;
  authorId: number;
  authorName: string;
  authorNameId: string;
  authorAvatarUrl: string | null;
  profileUrl: string;
  tags: string[];
  value: number;
}

export interface AuthorLeaderboardRow {
  authorId: number;
  authorName: string;
  nameId: string;
  avatarUrl: string | null;
  pluginCount: number;
  value: number;
}

export interface SearchPluginRow {
  id: number;
  nameId: string;
  name: string;
  author: string;
  authorAvatarUrl: string | null;
  total: number;
}

export interface SearchAuthorRow {
  id: number;
  nameId: string;
  name: string;
  avatarUrl: string | null;
  pluginCount: number;
  total: number;
}

export interface SearchResult {
  plugins: SearchPluginRow[];
  authors: SearchAuthorRow[];
}

export interface NewestPluginRow {
  id: number;
  nameId: string;
  name: string;
  authorId: number;
  authorName: string;
  authorNameId: string;
  profileUrl: string;
  tags: string[];
  logoUrl: string | null;
  dateAdded: string;
  downloadsTotal: number;
}

export interface SiteStats {
  pluginCount: number;
  authorCount: number;
  downloadsTotal: number;
  subscribersTotal: number;
  updatedAt: string | null;
}

export interface FastestGrowingPlugin {
  id: number;
  nameId: string;
  name: string;
  authorId: number;
  authorName: string;
  authorNameId: string;
  profileUrl: string;
  downloadsTotal: number;
  subscribersTotal: number;
  downloadsGain: number;
  subscribersGain: number;
  downloadsGrowthPct: number;
  growthScore: number;
}

export interface PluginTrendPoint {
  capturedAt: string;
  downloadsTotal: number;
  downloadsToday: number;
  subscribersTotal: number;
  // The plugin's own upstream "last updated" value as of this snapshot, so
  // a release/version update can be told apart from a game update -- null
  // on snapshots taken before this was tracked (see schema.sql).
  dateUpdated: string | null;
}

export type GameKey = "runescape" | "osrs" | "runelite";

// Narrower than GameKey, used only by game_updates/special_events.
// RuneLite and OSRS-via-mod.io are the same underlying game, just
// different data sources, so both should be annotated by the same wiki
// updates/special events rather than tracked as separate "game" scopes --
// everything else (plugins, plugin_snapshots, external_id_map, the
// GameSwitcher/UI, etc.) keeps using the full three-way GameKey unchanged.
// getGameUpdates/getSpecialEvents map an incoming "runelite"/"osrs"
// GameKey onto "oldschool" before querying either table.
export type AnnotationGameKey = "runescape" | "oldschool";

export interface CoAuthorIngest {
  authorId: number;
  name: string;
  avatarUrl: string | null;
  profileUrl: string | null;
}

export interface CoAuthor {
  authorId: number;
  nameId: string;
  name: string;
  avatarUrl: string | null;
  profileUrl: string | null;
}

export interface IngestedMod {
  game: GameKey;
  id: number;
  nameId: string;
  name: string;
  authorId: number;
  authorName: string;
  authorProfileUrl: string;
  authorAvatarUrl: string | null;
  // Full contributor list (always includes the primary author above as
  // the first entry) -- lets RuneLite's occasional multi-person credits
  // get their own individual author pages instead of being merged.
  coAuthors: CoAuthorIngest[];
  profileUrl: string;
  tags: string[];
  logoUrl: string | null;
  summary: string;
  dateAdded: number;
  dateUpdated: number;
  downloadsTotal: number;
  downloadsToday: number;
  subscribersTotal: number;
  popularityRankPosition: number | null;
  ratingsTotal: number;
  ratingsPositive: number;
  ratingsNegative: number;
  ratingsPercentagePositive: number;
  ratingsDisplayText: string;
}

export interface AuthorProfilePlugin {
  id: number;
  nameId: string;
  name: string;
  dateAdded: string;
  downloadsTotal: number;
  weeklyGain: number;
  subscribersTotal: number;
  hot: boolean;
}

export interface AuthorProfile {
  authorId: number;
  game: string;
  authorName: string;
  authorProfileUrl: string;
  authorAvatarUrl: string | null;
  pluginCount: number;
  publishingSince: string;
  totals: {
    downloadsTotal: number;
    downloadsToday: number;
    weeklyGain: number;
    subscribersTotal: number;
  };
  ranks: {
    allTime: number | null;
    hotToday: number | null;
    hotWeek: number | null;
  };
  plugins: AuthorProfilePlugin[];
}

export type EmbedCardType = "plugin" | "author";

export interface EmbedCardOptions {
  theme: "dark" | "light";
  spark: boolean;
  sparkDays: number;
  showSubtitle: boolean;
  showHot: boolean;
  showStatDownloads: boolean;
  showStatWeek: boolean;
  showStatThird: boolean;
  showFooter: boolean;
  showImage: boolean;
  accentColor: string;
  bgColor: string;
  textColor: string;
}

export interface EmbedCardConfig extends EmbedCardOptions {
  id: string;
  type: EmbedCardType;
  entityId: number;
}

export interface DailyPoint {
  date: string;
  downloads: number;
  avg7: number;
}

export interface CategoryStat {
  name: string;
  pluginCount: number;
  downloadsTotal: number;
  weekGain: number;
}

export interface CategoryStatsPage {
  categories: CategoryStat[];
  total: number;
  maxDownloads: number;
}

export interface GrowthSparkRow {
  id: number;
  nameId: string;
  name: string;
  authorId: number;
  authorName: string;
  growthPct: number;
  spark: number[];
}

export interface NewReleaseRow {
  id: number;
  nameId: string;
  name: string;
  authorId: number;
  authorName: string;
  dateAdded: string;
  downloadsTotal: number;
}

export interface StatsOverview {
  updatedAt: string | null;
  totals: {
    downloadsTotal: number;
    downloadsWeek: number;
    downloadsToday: number;
    avg7Yesterday: number;
    plugins: number;
    pluginsNew30d: number;
    authors: number;
    authorsReleased30d: number;
  };
  daily: DailyPoint[];
  fastestGrowing: GrowthSparkRow[];
  newReleases: NewReleaseRow[];
}

export interface GameUpdate {
  id: number;
  game: AnnotationGameKey;
  title: string;
  date: string;
  url: string;
  wikiUrl: string;
}

export interface GameUpdateInput {
  game: AnnotationGameKey;
  wikiPageId: number;
  title: string;
  date: string;
  url: string;
  wikiUrl: string;
}

export interface SpecialEvent {
  id: number;
  game: AnnotationGameKey;
  title: string;
  start: string;
  end: string | null;
  url: string | null;
}

export interface SpecialEventInput {
  game: AnnotationGameKey;
  title: string;
  start: string;
  end: string | null;
  url: string | null;
}

export type CompareType = "plugin" | "author";
export type CompareMetric = "total" | "daily" | "subs";
export type CompareRange = 30 | 90 | "all";

export interface CompareItemStats {
  all: number;
  hot: number;
  week: number;
  month: number;
  subs: number;
  rank: number | null;
  hotRank: number | null;
  count: number | null;
  start: string;
}

export interface CompareItem {
  key: number;
  nameId: string;
  name: string;
  sub: string;
  series: number[];
  // Per-day ISO dateUpdated snapshot, aligned 1:1 with `series` -- only
  // populated for type "plugin" (an author's releases don't collapse into
  // one series, see getCompareData). A day-to-day change in this value
  // marks a plugin release ("Plugin updates" in the Compare chart).
  releases?: (string | null)[];
  stats: CompareItemStats;
}

export interface CompareResult {
  type: CompareType;
  metric: CompareMetric;
  from: string;
  to: string;
  items: CompareItem[];
}
