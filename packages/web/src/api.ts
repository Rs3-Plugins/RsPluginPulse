import type { Game } from "./context/GameContext";

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
  coAuthorNames: string[];
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
  coAuthorNames: string[];
}

export interface PluginTrendPoint {
  capturedAt: string;
  downloadsTotal: number;
  downloadsToday: number;
  subscribersTotal: number;
  dateUpdated: string | null;
}

export interface GameUpdate {
  id: number;
  game: Game;
  title: string;
  date: string;
  url: string;
  wikiUrl: string;
}

export interface SpecialEvent {
  id: number;
  game: Game;
  title: string;
  start: string;
  end: string | null;
  url: string | null;
}

export interface CoAuthor {
  authorId: number;
  nameId: string;
  name: string;
  avatarUrl: string | null;
  profileUrl: string | null;
}

export interface PluginMeta {
  id: number;
  game: Game;
  nameId: string;
  name: string;
  authorId: number;
  authorName: string;
  authorNameId: string;
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
  game: Game;
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
  coAuthorNames: string[];
}

export interface SiteStats {
  pluginCount: number;
  authorCount: number;
  downloadsTotal: number;
  subscribersTotal: number;
  updatedAt: string | null;
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

export type CompareType = "plugin" | "author";
export type CompareMetric = "total" | "daily" | "subs";
export type CompareRangeKey = 30 | 90 | "all";

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
  // Only populated for type "plugin" -- see CompareItem in packages/db/src/types.ts.
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

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`GET ${path} -> HTTP ${response.status}`);
  return response.json();
}

export function getTopPlugins(period: Period, game: Game = "runescape", limit = 10000) {
  return getJson<{ period: Period; plugins: PluginLeaderboardRow[] }>(`/api/leaderboard/plugins?period=${period}&limit=${limit}&game=${game}`);
}

export function getTopAuthors(period: Period, game: Game = "runescape", limit = 10000) {
  return getJson<{ period: Period; authors: AuthorLeaderboardRow[] }>(`/api/leaderboard/authors?period=${period}&limit=${limit}&game=${game}`);
}

export interface PluginInfo extends PluginMeta {
  downloadsTotal: number;
  downloadsToday: number;
  subscribersTotal: number;
  popularityRankPosition: number | null;
}

// Basic metadata + current stats, no snapshot history -- a cheaper call
// than getPluginTrend for callers that only want "what are this plugin's
// numbers right now".
export function getPluginInfo(id: string | number, game: Game = "runescape") {
  return getJson<PluginInfo>(`/api/plugins/${encodeURIComponent(id)}?game=${game}`);
}

// `id` may be a numeric id (globally unique, no game needed) or a pretty
// slug ("117hd") -- slugs are only unique per game, so `game` matters for
// those. Always sent; the API ignores it for a numeric id.
//
// `window` swaps the usual one-point-per-day series for raw, un-bucketed
// ingest snapshots -- "today" (since 00:00 UTC) or "24h" (rolling last day)
// -- used by the chart's Today/24h zoom buttons.
export function getPluginTrend(id: string | number, game: Game = "runescape", window?: "today" | "24h") {
  return getJson<{ pluginId: number; plugin: PluginMeta; trend: PluginTrendPoint[] }>(
    `/api/plugins/${encodeURIComponent(id)}/trend?game=${game}${window ? `&window=${window}` : ""}`,
  );
}

// "unavailable" is the plugin-hub bot pulling a broken plugin, not a real
// content/version change -- resolveReleases (trendAnnotations.ts) filters
// these out before anything reaches the chart.
export type PluginReleaseKind = "update" | "unavailable";

export interface PluginRelease {
  id: number;
  pluginId: number;
  source: "modio" | "plugin-hub";
  kind: PluginReleaseKind;
  releasedAt: string;
  version: string | null;
  changelog: string | null;
  url: string | null;
}

export function getPluginReleases(id: string | number, game: Game = "runescape") {
  return getJson<{ releases: PluginRelease[] }>(`/api/plugins/${encodeURIComponent(id)}/releases?game=${game}`);
}

// Batch form for the Compare page -- up to 4 plugin ids at once.
export function getPluginReleasesBatch(ids: number[]) {
  return getJson<{ releases: Record<number, PluginRelease[]> }>(`/api/plugins/releases?ids=${ids.join(",")}`);
}

export function getGameUpdates(game: Game, from: string, to: string) {
  return getJson<{ updates: GameUpdate[] }>(`/api/game-updates?game=${game}&from=${from}&to=${to}`);
}

export function getSpecialEvents(game: Game, from: string, to: string) {
  return getJson<{ events: SpecialEvent[] }>(`/api/special-events?game=${game}&from=${from}&to=${to}`);
}

export function getAuthorProfile(id: string | number, game: Game = "runescape") {
  return getJson<AuthorProfile>(`/api/authors/${encodeURIComponent(id)}?game=${game}`);
}

export function search(query: string, game: Game = "runescape", limit?: number) {
  const params = new URLSearchParams({ q: query, game });
  if (limit) params.set("limit", String(limit));
  return getJson<SearchResult>(`/api/search?${params}`);
}

export function getStatus(game?: Game) {
  return getJson<{ updatedAt: string | null }>(`/api/status${game ? `?game=${game}` : ""}`);
}

export function getFastestGrowingPlugins(limit = 5, days = 7, game: Game = "runescape") {
  return getJson<{ plugins: FastestGrowingPlugin[] }>(`/api/leaderboard/fastest-growing?limit=${limit}&days=${days}&game=${game}`);
}

export function getRandomPlugin(game: Game = "runescape") {
  return getJson<{ id: number; nameId: string }>(`/api/plugins/random?game=${game}`);
}

export function getNewestPlugins(limit = 50, game: Game = "runescape") {
  return getJson<{ plugins: NewestPluginRow[] }>(`/api/leaderboard/newest?limit=${limit}&game=${game}`);
}

export function getSiteStats(game: Game = "runescape") {
  return getJson<SiteStats>(`/api/stats?game=${game}`);
}

export function getStatsOverview(range: 30 | 90 | 365 = 90, game: Game = "runescape") {
  return getJson<StatsOverview>(`/api/stats/overview?range=${range}&game=${game}`);
}

export function getCategoryStatsPage(page: number, pageSize: number, game: Game = "runescape") {
  return getJson<CategoryStatsPage>(`/api/stats/categories?page=${page}&pageSize=${pageSize}&game=${game}`);
}

export function getCompareData(type: CompareType, keys: number[], metric: CompareMetric, range: CompareRangeKey) {
  return getJson<CompareResult>(`/api/compare?type=${type}&keys=${keys.join(",")}&metric=${metric}&range=${range}`);
}
