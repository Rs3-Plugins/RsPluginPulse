import type { Game } from "./context/GameContext";

export type Period = "alltime" | "hot" | "weekly" | "monthly";

export interface PluginLeaderboardRow {
  id: number;
  nameId: string;
  name: string;
  authorId: number;
  authorName: string;
  profileUrl: string;
  tags: string[];
  value: number;
}

export interface AuthorLeaderboardRow {
  authorId: number;
  authorName: string;
  pluginCount: number;
  value: number;
}

export interface SearchPluginRow {
  id: number;
  name: string;
  author: string;
  authorAvatarUrl: string | null;
  total: number;
}

export interface SearchAuthorRow {
  id: number;
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
}

export interface CoAuthor {
  authorId: number;
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
  name: string;
  authorId: number;
  authorName: string;
  growthPct: number;
  spark: number[];
}

export interface NewReleaseRow {
  id: number;
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
  name: string;
  sub: string;
  series: number[];
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

export function getTopPlugins(period: Period, game: Game = "rs3", limit = 10000) {
  return getJson<{ period: Period; plugins: PluginLeaderboardRow[] }>(`/api/leaderboard/plugins?period=${period}&limit=${limit}&game=${game}`);
}

export function getTopAuthors(period: Period, game: Game = "rs3", limit = 10000) {
  return getJson<{ period: Period; authors: AuthorLeaderboardRow[] }>(`/api/leaderboard/authors?period=${period}&limit=${limit}&game=${game}`);
}

export function getPluginTrend(pluginId: number) {
  return getJson<{ pluginId: number; plugin: PluginMeta; trend: PluginTrendPoint[] }>(`/api/plugins/${pluginId}/trend`);
}

export function getAuthorProfile(authorId: number) {
  return getJson<AuthorProfile>(`/api/authors/${authorId}`);
}

export function search(query: string, game: Game = "rs3", limit?: number) {
  const params = new URLSearchParams({ q: query, game });
  if (limit) params.set("limit", String(limit));
  return getJson<SearchResult>(`/api/search?${params}`);
}

export function getStatus(game?: Game) {
  return getJson<{ updatedAt: string | null }>(`/api/status${game ? `?game=${game}` : ""}`);
}

export function getFastestGrowingPlugins(limit = 5, days = 7, game: Game = "rs3") {
  return getJson<{ plugins: FastestGrowingPlugin[] }>(`/api/leaderboard/fastest-growing?limit=${limit}&days=${days}&game=${game}`);
}

export function getRandomPlugin(game: Game = "rs3") {
  return getJson<{ id: number }>(`/api/plugins/random?game=${game}`);
}

export function getNewestPlugins(limit = 50, game: Game = "rs3") {
  return getJson<{ plugins: NewestPluginRow[] }>(`/api/leaderboard/newest?limit=${limit}&game=${game}`);
}

export function getSiteStats(game: Game = "rs3") {
  return getJson<SiteStats>(`/api/stats?game=${game}`);
}

export function getStatsOverview(range: 30 | 90 | 365 = 90, game: Game = "rs3") {
  return getJson<StatsOverview>(`/api/stats/overview?range=${range}&game=${game}`);
}

export function getCategoryStatsPage(page: number, pageSize: number, game: Game = "rs3") {
  return getJson<CategoryStatsPage>(`/api/stats/categories?page=${page}&pageSize=${pageSize}&game=${game}`);
}

export function getCompareData(type: CompareType, keys: number[], metric: CompareMetric, range: CompareRangeKey) {
  return getJson<CompareResult>(`/api/compare?type=${type}&keys=${keys.join(",")}&metric=${metric}&range=${range}`);
}
