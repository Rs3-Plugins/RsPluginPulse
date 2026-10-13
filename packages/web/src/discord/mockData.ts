// UI-only mock data for the Discord dashboard, ported from the design
// handoff (design_handoff_discord/PluginPulse Discord Dashboard.dc.html).
// No backend yet -- see that file's README for the real API shape this
// will eventually read/write.

export type EntityKind = "plugin" | "author";
export type Game = "RuneScape" | "RuneLite";

export interface Entity {
  id: string;
  kind: EntityKind;
  game: Game;
  name: string;
  author?: string;
  installs: number;
  subs?: number;
  plugins?: number;
  rank: number;
  change: number; // % this week
}

export const ENT: Entity[] = [
  { id: "p1", kind: "plugin", game: "RuneScape", name: "Ground Markers", author: "Ironwick", installs: 414200, subs: 61800, rank: 1, change: 8.4 },
  { id: "p2", kind: "plugin", game: "RuneScape", name: "Clue Scroll Helper", author: "Velmora", installs: 228900, subs: 30500, rank: 4, change: -3.1 },
  { id: "p3", kind: "plugin", game: "RuneLite", name: "Tick Counter Plus", author: "Brannoch", installs: 182400, subs: 22100, rank: 2, change: 4.9 },
  { id: "p4", kind: "plugin", game: "RuneScape", name: "Boss Timer Overlay", author: "Ironwick", installs: 96300, subs: 12400, rank: 9, change: 22.6 },
  { id: "p5", kind: "plugin", game: "RuneLite", name: "Inventory Tagger", author: "Selvane", installs: 74100, subs: 8800, rank: 12, change: 1.2 },
  { id: "p6", kind: "plugin", game: "RuneLite", name: "Farming Run Planner", author: "Velmora", installs: 51800, subs: 6100, rank: 17, change: -16.4 },
  { id: "a1", kind: "author", game: "RuneScape", name: "Ironwick", installs: 612000, plugins: 7, rank: 1, change: 6.2 },
  { id: "a2", kind: "author", game: "RuneScape", name: "Velmora", installs: 341000, plugins: 5, rank: 3, change: -1.8 },
  { id: "a3", kind: "author", game: "RuneLite", name: "Brannoch", installs: 244000, plugins: 4, rank: 2, change: 3.3 },
  { id: "a4", kind: "author", game: "RuneLite", name: "Selvane", installs: 98000, plugins: 3, rank: 8, change: 0.6 },
];

export function byId(id: string): Entity {
  return ENT.find((e) => e.id === id) ?? ENT[0];
}

export interface Guild {
  id: string;
  name: string;
  init: string;
  members: string;
  bot: boolean;
  since?: string;
}

export const GUILDS: Guild[] = [
  { id: "g1", name: "Ironwick Plugins", init: "IP", members: "2.4k", bot: true, since: "Oct 2" },
  { id: "g2", name: "Varrock Lounge", init: "VL", members: "860", bot: true, since: "Sep 14" },
  { id: "g3", name: "RS Modding Hub", init: "RM", members: "12.1k", bot: false },
  { id: "g4", name: "Gielinor Devs", init: "GD", members: "310", bot: false },
];

export const CHANNELS = ["plugin-alerts", "general", "stats", "releases", "ironwick-plugins"];

export const COLORS: { color: string; label: string }[] = [
  { color: "#caa44d", label: "Gold" },
  { color: "#a6192e", label: "Ember" },
  { color: "#5fb3a3", label: "Teal" },
  { color: "#8f9be0", label: "Lavender" },
  { color: "#ece6d6", label: "Parchment" },
];

export type EmbedTarget = "plugin" | "author" | "alert";

export const FIELDSETS: Record<EmbedTarget, { key: string; label: string }[]> = {
  plugin: [
    { key: "installs", label: "Installs" },
    { key: "subs", label: "Subscribers" },
    { key: "rank", label: "Rank" },
    { key: "change", label: "Weekly change" },
    { key: "game", label: "Game" },
  ],
  author: [
    { key: "plugins", label: "Plugins" },
    { key: "installs", label: "Installs" },
    { key: "rank", label: "Rank" },
    { key: "change", label: "Weekly change" },
    { key: "game", label: "Game" },
  ],
  alert: [
    { key: "old", label: "Before" },
    { key: "new", label: "Now" },
    { key: "change", label: "Change" },
    { key: "rank", label: "Rank" },
  ],
};

export const PLACEHOLDERS: Record<EmbedTarget, string[]> = {
  plugin: ["{name}", "{author}", "{installs}", "{subscribers}", "{rank}", "{change}", "{game}"],
  author: ["{name}", "{plugins}", "{installs}", "{rank}", "{change}", "{game}"],
  alert: ["{name}", "{direction}", "{pct}", "{old}", "{new}", "{rank}"],
};

export interface EmbedConfig {
  color: string;
  title: string;
  desc: string;
  fields: Record<string, 0 | 1>;
  img: "none" | "thumb" | "card";
  foot: string;
}

export const DEFAULT_EMBEDS: Record<EmbedTarget, EmbedConfig> = {
  plugin: { color: "#caa44d", title: "{name}", desc: "by {author} · {game}", fields: { installs: 1, subs: 1, rank: 1 }, img: "none", foot: "PluginPulse · updated hourly" },
  author: { color: "#caa44d", title: "{name}", desc: "{plugins} plugins on {game}", fields: { plugins: 1, installs: 1, rank: 1 }, img: "thumb", foot: "PluginPulse · updated hourly" },
  alert: {
    color: "#a6192e",
    title: "{name} {direction} {pct}",
    desc: "Installs went from {old} to {new} since the last hourly check.",
    fields: { old: 1, new: 1, rank: 1 },
    img: "card",
    foot: "PluginPulse watch alert",
  },
};

export const ROLES = ["Plugin Watchers", "Developers", "Members", "Moderators"];

export interface AnnounceSample {
  name: string;
  by: string;
  ver: string;
  url: string;
  site: string;
}

export const ANNOUNCE_SAMPLES: Record<"rel" | "upd", Record<"modio" | "rl", AnnounceSample>> = {
  rel: {
    modio: { name: "Clue Scroll Helper", by: "Ironwick", ver: "v1.0.0", url: "mod.io/g/runescape/m/clue-scroll-helper", site: "mod.io" },
    rl: { name: "Ground Markers Plus", by: "Kestrel", ver: "v1.0.0", url: "runelite.net/plugin-hub/show/ground-markers-plus", site: "RuneLite Plugin Hub" },
  },
  upd: {
    modio: { name: "Slayer Assistant", by: "Ironwick", ver: "v2.4.1", url: "mod.io/g/runescape/m/slayer-assistant", site: "mod.io" },
    rl: { name: "Quest Helper", by: "Zoinkwiz", ver: "v4.12.0", url: "runelite.net/plugin-hub/show/quest-helper", site: "RuneLite Plugin Hub" },
  },
};

export function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(n);
}

export function pct(n: number): string {
  return (n > 0 ? "+" : "") + n.toFixed(1) + "%";
}

export interface EntityVals {
  name: string;
  author: string;
  installs: string;
  subscribers: string;
  subs: string;
  rank: string;
  change: string;
  game: string;
  plugins: string;
  direction: "rose" | "fell";
  pct: string;
  old: string;
  new: string;
}

// For an alert preview, the "move" is a fixed illustrative 18.2%/16.4% (up/down)
// rather than the entity's own weekly change -- an alert is about THIS move,
// not the week as a whole.
export function vals(e: Entity, kind: EmbedTarget | EntityKind): EntityVals {
  const up = e.change >= 0;
  const mv = Math.abs(kind === "alert" ? (up ? 18.2 : 16.4) : e.change);
  const old = Math.round(e.installs / (1 + (up ? mv : -mv) / 100));
  return {
    name: e.name,
    author: e.author ?? e.name,
    installs: fmt(e.installs),
    subscribers: fmt(e.subs ?? 0),
    subs: fmt(e.subs ?? 0),
    rank: "#" + e.rank,
    change: pct(e.change),
    game: e.game,
    plugins: String(e.plugins ?? 0),
    direction: up ? "rose" : "fell",
    pct: mv.toFixed(0) + "%",
    old: fmt(old),
    new: fmt(e.installs),
  };
}

// Fills a template like "{name}: {installs} installs", stripping the
// leading "#" off rank (channel topics/watch metas read "#1", not "##1").
export function fill(template: string, v: EntityVals): string {
  return (template || "").replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? (k === "rank" ? v.rank.slice(1) : (v as unknown as Record<string, string>)[k]) : m));
}

// Same, but keeps "#rank" as-is -- used for embed title/description/footer,
// where "#1" reads naturally (unlike a topic/watch meta line).
export function fillRank(template: string, v: EntityVals): string {
  return (template || "").replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? (v as unknown as Record<string, string>)[k] : m));
}

// Deterministic pseudo-random sparkline points, seeded off the entity id so
// the same plugin always draws the same shape in the embed preview.
export function spark(id: string): string {
  let s = 0;
  for (const c of id) s += c.charCodeAt(0);
  const pts: string[] = [];
  let y = 26;
  for (let i = 0; i < 14; i++) {
    s = (s * 9301 + 49297) % 233280;
    y = Math.max(6, Math.min(34, y - (s / 233280 - 0.35) * 7));
    pts.push(i * 10 + "," + y.toFixed(1));
  }
  return pts.join(" ");
}
