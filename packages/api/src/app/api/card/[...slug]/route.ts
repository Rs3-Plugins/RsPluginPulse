import { getAuthorProfile, getEmbedCard, getPlugin, type EmbedCardOptions, type EmbedCardType } from "@rspluginpulse/db";
import { getCachedCard, setCachedCard } from "@/lib/cardCache";
import { renderCardPng } from "@/lib/cardSvg";
import { jsonWithCors, OPTIONS as corsOptions, pngWithCors } from "@/lib/cors";
import { parseGame } from "@/lib/game";
import { resolveAuthor, resolvePlugin } from "@/lib/resolveEntity";

export const OPTIONS = corsOptions;

function parseTheme(v: string | null): "dark" | "light" {
  return v === "light" ? "light" : "dark";
}

// All these default to true/30 -- query params only turn things off.
function parseBool(v: string | null, fallback: boolean): boolean {
  if (v === null) return fallback;
  return v !== "0" && v !== "false";
}

function parseDays(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 30;
}

// Plugins default to the hex/initials fallback icon (no real logo);
// authors default to their real mod.io profile picture.
function optionsFromSearchParams(searchParams: URLSearchParams, type: EmbedCardType): EmbedCardOptions {
  return {
    theme: parseTheme(searchParams.get("theme")),
    spark: parseBool(searchParams.get("spark"), true),
    sparkDays: parseDays(searchParams.get("sparkDays")),
    showSubtitle: parseBool(searchParams.get("showSubtitle"), true),
    showHot: parseBool(searchParams.get("showHot"), true),
    showStatDownloads: parseBool(searchParams.get("showStatDownloads"), true),
    showStatWeek: parseBool(searchParams.get("showStatWeek"), true),
    showStatThird: parseBool(searchParams.get("showStatThird"), true),
    showFooter: parseBool(searchParams.get("showFooter"), true),
    showImage: parseBool(searchParams.get("showImage"), type === "author"),
    accentColor: searchParams.get("accentColor")?.trim() ?? "",
    bgColor: searchParams.get("bgColor")?.trim() ?? "",
    textColor: searchParams.get("textColor")?.trim() ?? "",
  };
}

function cacheKeyFor(type: EmbedCardType, entityId: number, options: EmbedCardOptions): string {
  return [
    type,
    entityId,
    options.theme,
    options.spark ? "1" : "0",
    options.sparkDays,
    options.showSubtitle ? "1" : "0",
    options.showHot ? "1" : "0",
    options.showStatDownloads ? "1" : "0",
    options.showStatWeek ? "1" : "0",
    options.showStatThird ? "1" : "0",
    options.showFooter ? "1" : "0",
    options.showImage ? "1" : "0",
    options.accentColor || "-",
    options.bgColor || "-",
    options.textColor || "-",
  ].join("-");
}

// Two shapes share this route: the long form /api/card/{type}/{key}.png
// (with ?theme=&spark=&... query params) and the short form
// /api/card/{id}.png, which looks the same settings up from a short link
// created via /api/embed/shorten. A catch-all avoids Next's "different
// slug names at the same level" restriction that a [type]/[key] + [id]
// split would hit. PNG, not SVG: Discord and most chat apps don't render
// inline SVG in link previews. The .svg suffix still works (stripped the
// same as .png) for anything that already linked the old extension.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  let type: EmbedCardType;
  let entityId: number;
  let options: EmbedCardOptions;

  if (slug.length === 2) {
    const [rawType, rawKey] = slug;
    if (rawType !== "plugin" && rawType !== "author") {
      return jsonWithCors({ error: { status: 400, message: "type must be one of: plugin, author" } }, { status: 400 });
    }
    // `rawKey` may be a numeric id or a pretty slug -- see resolveEntity.ts.
    const key = rawKey.replace(/\.(svg|png)$/i, "");
    const id =
      rawType === "plugin"
        ? await resolvePlugin(key, game, async (pluginId) => ((await getPlugin(pluginId)) ? pluginId : null))
        : await resolveAuthor(key, game, async (authorId) => ((await getAuthorProfile(authorId)) ? authorId : null));
    if (id === null) {
      return jsonWithCors({ error: { status: 404, message: `No ${rawType} found for "${key}"` } }, { status: 404 });
    }
    type = rawType;
    entityId = id;
    options = optionsFromSearchParams(searchParams, rawType);
  } else if (slug.length === 1) {
    const shortId = slug[0].replace(/\.(svg|png)$/i, "");
    const config = await getEmbedCard(shortId);
    if (!config) {
      return jsonWithCors({ error: { status: 404, message: `No embed card with id "${shortId}"` } }, { status: 404 });
    }
    type = config.type;
    entityId = config.entityId;
    options = config;
  } else {
    return jsonWithCors({ error: { status: 400, message: "invalid card path" } }, { status: 400 });
  }

  const cacheKey = cacheKeyFor(type, entityId, options);
  const cached = await getCachedCard(cacheKey);
  if (cached) {
    return pngWithCors(cached, { headers: { "Cache-Control": "public, max-age=3600" } });
  }

  const png = await renderCardPng(type, entityId, options);
  if (!png) {
    return jsonWithCors({ error: { status: 404, message: `No ${type} with id ${entityId}` } }, { status: 404 });
  }

  await setCachedCard(cacheKey, png);
  return pngWithCors(png, { headers: { "Cache-Control": "public, max-age=3600" } });
}
