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
  // Names of co-authors beyond the primary one above (plugin_authors
  // position >= 1) -- empty for the vast majority of plugins, which have
  // exactly one author.
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

// See schema.sql's plugin_releases table comment for the "source"/"source_key"
// upsert-key rationale.
// "unavailable" is the plugin-hub bot pulling a broken plugin from the hub
// listing (a "disable X"/"unavailable X" commit) -- a real event worth
// tracking, but not a content/version change, so the frontend should never
// show it as a Release/Update marker. mod.io releases are always "update".
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

export interface PluginReleaseInput {
  pluginId: number;
  source: "modio" | "plugin-hub";
  sourceKey: string;
  kind: PluginReleaseKind;
  releasedAt: string;
  version: string | null;
  changelog: string | null;
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
  stats: CompareItemStats;
}

export interface CompareResult {
  type: CompareType;
  metric: CompareMetric;
  from: string;
  to: string;
  items: CompareItem[];
}

// "Log in with Discord" session (identify + guilds scopes) for the
// /discord dashboard -- see docs/discord-bot.md. Separate from the (not
// yet built) bot-install flow.
export interface DiscordSession {
  id: string;
  discordUserId: string;
  username: string;
  avatarHash: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// Shared by channel-topic bindings and per-entity announcement bindings --
// both let you pick either a specific plugin or a specific author.
export type DiscordEntityKind = "plugin" | "author";

// A channel-topic binding (docs/discord-bot.md's "Channel description
// templates") -- see schema.sql's comment on discord_channel_topics.
export interface DiscordChannelTopic {
  id: number;
  guildId: string;
  channelId: string;
  channelName: string;
  entityKind: DiscordEntityKind;
  entityId: number;
  entityName: string;
  template: string;
  lastRenderedTopic: string | null;
  lastRenderedAt: Date | null;
  createdAt: Date;
}

export interface DiscordChannelTopicInput {
  guildId: string;
  channelId: string;
  channelName: string;
  entityKind: DiscordEntityKind;
  entityId: number;
  entityName: string;
  template: string;
}

// See schema.sql's comment on discord_guild_admins -- a hand-picked admin
// of one specific guild's dashboard, distinct from "has Manage Server".
export interface DiscordGuildAdmin {
  id: number;
  guildId: string;
  discordUserId: string;
  addedBy: string;
  createdAt: Date;
}

// See schema.sql's comment on discord_guild_subscriptions -- the row
// itself existing means the guild is subscribed; no row means free tier.
export interface DiscordGuildSubscription {
  guildId: string;
  grantedBy: string;
  createdAt: Date;
}

// See schema.sql's comment on site_admins -- a site-wide mod, distinct
// from DiscordGuildAdmin above (which is scoped to one guild).
export interface SiteAdmin {
  id: number;
  discordUserId: string;
  addedBy: string;
  createdAt: Date;
}

export type DiscordAnnouncementKind = "release" | "update";

// Ping is three independent signals, not one mutually-exclusive mode --
// see schema.sql's comment on discord_announcement_watches. pingHere and
// pingEveryone are mutually exclusive with *each other* (enforced by a DB
// CHECK), but either can be combined with any set of pingRoleIds.
export interface DiscordPing {
  pingHere: boolean;
  pingEveryone: boolean;
  pingRoleIds: string[];
  pingRoleNames: string[];
}

// See schema.sql's comment on discord_announcement_watches -- the Global
// tab's rows.
export interface DiscordAnnouncementWatch extends DiscordPing {
  id: number;
  guildId: string;
  channelId: string;
  channelName: string;
  kind: DiscordAnnouncementKind;
  games: string[];
  showThumbnail: boolean;
  lastAnnouncedAt: Date;
  createdAt: Date;
}

export interface DiscordAnnouncementWatchInput extends DiscordPing {
  guildId: string;
  channelId: string;
  channelName: string;
  kind: DiscordAnnouncementKind;
  games: string[];
  showThumbnail: boolean;
}

export type DiscordEntityAnnouncementKind = "release" | "update" | "both";

// See schema.sql's comment on discord_entity_announcements -- the
// Per-plugin/author tab's rows. entityKind 'author' means "any plugin
// published/updated by this author", not a literal author-profile event.
export interface DiscordEntityAnnouncement extends DiscordPing {
  id: number;
  guildId: string;
  channelId: string;
  channelName: string;
  entityKind: DiscordEntityKind;
  entityId: number;
  entityName: string;
  kind: DiscordEntityAnnouncementKind;
  showThumbnail: boolean;
  lastAnnouncedAt: Date;
  createdAt: Date;
}

export interface DiscordEntityAnnouncementInput extends DiscordPing {
  guildId: string;
  channelId: string;
  channelName: string;
  entityKind: DiscordEntityKind;
  entityId: number;
  entityName: string;
  kind: DiscordEntityAnnouncementKind;
  showThumbnail: boolean;
}

// See schema.sql's comment on discord_guild_announcement_embed -- the
// Embed builder tab's per-guild config, subscriber-gated.
export interface DiscordGuildAnnouncementEmbed {
  guildId: string;
  color: string;
  titleTemplate: string;
  descriptionTemplate: string;
  footerTemplate: string;
  showThumbnail: boolean;
  updatedAt: Date;
}

// See schema.sql's comment on discord_author_links -- global (not
// per-guild), one row per (discordUserId, game).
export type DiscordLinkGame = "runescape" | "runelite";

export interface DiscordAuthorLink {
  id: number;
  discordUserId: string;
  game: DiscordLinkGame;
  authorId: number;
  authorName: string;
  linkedAt: string;
}

// A plugin (new, or with a genuine update) that's due to be announced --
// what the detection queries in queries.ts hand to the discord-bot
// posting tick, already carrying everything renderAnnouncementEmbed
// needs without a second DB round trip per candidate.
export interface AnnouncementCandidate {
  kind: DiscordAnnouncementKind;
  pluginId: number;
  pluginName: string;
  pluginNameId: string;
  game: string;
  authorName: string;
  authorAvatarUrl: string | null;
  profileUrl: string;
  logoUrl: string | null;
  // The timestamp this candidate actually happened at (plugins.date_added
  // for a release candidate, plugin_releases.released_at for an update) --
  // watch/binding cursors advance to the max of these, not to "now", so a
  // slightly-late tick never skips something that happened just before it
  // ran.
  occurredAt: Date;
  version: string | null;
  changelog: string | null;
  releaseUrl: string | null;
}
