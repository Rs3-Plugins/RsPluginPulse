// Shared formatting helpers for slash command embeds. Deliberately
// duplicated rather than imported from packages/web (a Vite frontend, not
// consumable from this Node process) -- same trade-off the web app itself
// already makes by redefining compact() per-file (see SiteStats.tsx).

// Matches announcementRender.ts's own default embed color
// (0xcaa44d) so slash command replies and announcement posts read as the
// same bot/brand rather than two different-looking integrations.
export const BRAND_COLOR = 0xcaa44d;

export function compact(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(Math.round(v));
}

export function gameLabel(game: string): string {
  return game === "runelite" ? "RuneLite" : "RuneScape";
}

// Unit label for a game's primary stat -- RuneLite reports installs,
// mod.io (RuneScape) reports downloads (mirrors announcementRender.ts's
// siteLabel/gameLabel split for the same game keys).
export function downloadsUnit(game: string): string {
  return game === "runelite" ? "Installs" : "Downloads";
}

export function siteUrl(path: string): string {
  // `||`, not `??` -- a rendered-but-empty env var ("") is not nullish, so
  // `??` would never fall back from it (see cardImageUrl below).
  const base = (process.env.WEB_APP_URL || "https://rspluginpulse.com").replace(/\/$/, "");
  return `${base}${path}`;
}

// The API's own origin (distinct from WEB_APP_URL above, which is the
// dashboard frontend) -- needed to link straight to the existing
// /api/card/{type}/{key}.png stats-card renderer (packages/api/src/lib/
// cardSvg.ts) as an embed image, reusing it rather than building a
// from-scratch image generator for the bot (see docs/discord-bot.md's
// "Custom embed design" section). Numeric ids are globally unique across
// both games (see resolveEntity.ts), so no ?game= query param is needed
// here.
export function cardImageUrl(type: "plugin" | "author", entityId: number): string {
  // `||`, not `??` -- same reasoning as siteUrl above.
  const base = (process.env.API_BASE_URL || "https://api.rspluginpulse.com").replace(/\/$/, "");
  return `${base}/api/card/${type}/${entityId}.png`;
}

export const GAME_CHOICES = [
  { name: "RuneScape", value: "runescape" },
  { name: "RuneLite", value: "runelite" },
] as const;
