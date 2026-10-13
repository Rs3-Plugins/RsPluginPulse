import { next } from "@vercel/functions";

// Social/chat link-preview bots (Discord, Slack, Twitter, etc.) and most
// search crawlers don't execute JavaScript -- they just fetch the raw HTML
// and read its <head> tags. Since this is a client-rendered SPA, every
// route otherwise serves the exact same static title/description/image
// from index.html, so a shared /plugin/117hd link shows the generic
// homepage card instead of that plugin's actual name and stats. This
// intercepts known bot requests to the pages that matter most (plugin and
// author pages) and serves hand-built HTML with the real per-entity meta
// tags instead, while every other request (real browsers) falls straight
// through to the normal SPA via next().
const BOT_UA_PATTERN =
  /discordbot|slackbot|twitterbot|facebookexternalhit|linkedinbot|whatsapp|telegrambot|redditbot|pinterest|skypeuripreview|embedly|quora link preview|vkshare|w3c_validator|googlebot|bingbot|duckduckbot|yandexbot|applebot|baiduspider|discourse/i;

const SITE_URL = "https://rspluginpulse.com";
const API_BASE = process.env.VITE_API_BASE_URL ?? "https://api.rspluginpulse.com";

// Mirrors packages/db/src/slug.ts's slugify() exactly -- authors have no
// stored slug (their info is denormalized across plugins/plugin_authors,
// not a dedicated table), so this derives the same pretty-URL slug the
// rest of the app already produces, purely to build the canonical link.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compact(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(v);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface PageMeta {
  title: string;
  description: string;
  canonicalPath: string;
  image: string;
  bodyHeading: string;
  bodyText: string;
}

function renderHtml(meta: PageMeta): string {
  const canonicalUrl = `${SITE_URL}${meta.canonicalPath}`;
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${canonicalUrl}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="RuneScape PluginPulse" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonicalUrl}" />
<meta property="og:image" content="${meta.image}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${meta.image}" />
</head>
<body>
<h1>${escapeHtml(meta.bodyHeading)}</h1>
<p>${escapeHtml(meta.bodyText)}</p>
<p><a href="${canonicalUrl}">View live stats on RuneScape PluginPulse</a></p>
</body>
</html>`;
}

interface PluginInfo {
  id: number;
  game: string;
  nameId: string;
  name: string;
  authorName: string;
  summary: string;
  downloadsTotal: number;
  subscribersTotal: number;
}

interface AuthorProfile {
  authorId: number;
  game: string;
  authorName: string;
  pluginCount: number;
  totals: { downloadsTotal: number };
}

function notFoundMeta(pathname: string): PageMeta {
  return {
    title: "Page not found — RuneScape PluginPulse",
    description: "This page doesn't exist on RuneScape PluginPulse.",
    canonicalPath: pathname,
    image: `${SITE_URL}/og-image.png`,
    bodyHeading: "Page not found",
    bodyText: "This plugin or author doesn't exist on RuneScape PluginPulse.",
  };
}

async function metaForPlugin(idOrSlug: string, game: string): Promise<PageMeta | null> {
  const res = await fetch(`${API_BASE}/api/plugins/${encodeURIComponent(idOrSlug)}?game=${game}`);
  if (!res.ok) return null;
  const p: PluginInfo = await res.json();
  const noun = p.game === "runelite" ? "installs" : "downloads";
  const statsLine = `${compact(p.downloadsTotal)} ${noun}${p.game === "runelite" ? "" : ` · ${compact(p.subscribersTotal)} subscribers`}`;
  const canonicalPath = p.game === "runescape" ? `/plugin/${p.nameId}` : `/plugin/${p.nameId}?game=${p.game}`;
  return {
    title: `${p.name} by ${p.authorName} — RuneScape PluginPulse`,
    description: p.summary ? `${p.summary} — ${statsLine}.` : `${statsLine} on RuneScape PluginPulse.`,
    canonicalPath,
    image: `${API_BASE}/api/card/plugin/${p.id}.png`,
    bodyHeading: `${p.name} by ${p.authorName}`,
    bodyText: `${statsLine} on RuneScape PluginPulse.`,
  };
}

async function metaForAuthor(idOrSlug: string, game: string): Promise<PageMeta | null> {
  const res = await fetch(`${API_BASE}/api/authors/${encodeURIComponent(idOrSlug)}?game=${game}`);
  if (!res.ok) return null;
  const a: AuthorProfile = await res.json();
  const noun = a.game === "runelite" ? "installs" : "downloads";
  const statsLine = `${a.pluginCount} plugin${a.pluginCount === 1 ? "" : "s"} · ${compact(a.totals.downloadsTotal)} total ${noun}`;
  const slug = slugify(a.authorName);
  const canonicalPath = a.game === "runescape" ? `/author/${slug}` : `/author/${slug}?game=${a.game}`;
  return {
    title: `${a.authorName} — RuneScape PluginPulse`,
    description: `${statsLine} on RuneScape PluginPulse.`,
    canonicalPath,
    image: `${API_BASE}/api/card/author/${a.authorId}.png`,
    bodyHeading: a.authorName,
    bodyText: `${statsLine} on RuneScape PluginPulse.`,
  };
}

// Games with real ingested data -- osrs is a listed GameKey but has no
// plugins yet (see GameSwitcher.tsx's "soon" flag), so it's left out here
// rather than generating a sitemap section that's permanently empty.
const SITEMAP_GAMES = ["runescape", "runelite"];
const STATIC_PATHS = ["/", "/stats", "/compare", "/api"];

interface SitemapPluginRow {
  nameId: string;
}
interface SitemapAuthorRow {
  authorName: string;
}

async function buildSitemap(): Promise<string> {
  const urls = STATIC_PATHS.map((path) => `${SITE_URL}${path}`);

  await Promise.all(
    SITEMAP_GAMES.map(async (game) => {
      const gameParam = game === "runescape" ? "" : `?game=${game}`;
      const [pluginsRes, authorsRes] = await Promise.all([
        fetch(`${API_BASE}/api/leaderboard/plugins?period=alltime&limit=10000&game=${game}`),
        fetch(`${API_BASE}/api/leaderboard/authors?period=alltime&limit=10000&game=${game}`),
      ]);
      if (pluginsRes.ok) {
        const { plugins }: { plugins: SitemapPluginRow[] } = await pluginsRes.json();
        for (const p of plugins) urls.push(`${SITE_URL}/plugin/${p.nameId}${gameParam}`);
      }
      if (authorsRes.ok) {
        const { authors }: { authors: SitemapAuthorRow[] } = await authorsRes.json();
        for (const a of authors) urls.push(`${SITE_URL}/author/${slugify(a.authorName)}${gameParam}`);
      }
    }),
  );

  const body = urls.map((u) => `<url><loc>${escapeHtml(u)}</loc></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);

  // Sitemap fetchers don't necessarily send a recognizable bot UA, so this
  // is served to anyone who asks rather than gated on BOT_UA_PATTERN.
  if (url.pathname === "/sitemap.xml") {
    try {
      const xml = await buildSitemap();
      return new Response(xml, {
        headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
      });
    } catch {
      return next();
    }
  }

  const ua = request.headers.get("user-agent") ?? "";
  if (!BOT_UA_PATTERN.test(ua)) return next();

  const match = url.pathname.match(/^\/(plugin|author)\/([^/]+)$/);
  if (!match) return next();

  const [, kind, idOrSlug] = match;
  const game = url.searchParams.get("game") ?? "runescape";

  try {
    const meta = kind === "plugin" ? await metaForPlugin(idOrSlug, game) : await metaForAuthor(idOrSlug, game);
    // `meta` is only null when the API confirmed the entity doesn't exist
    // (a 404, not a network/parse error) -- telling the crawler that
    // outright with a real 404 status is better than silently falling
    // through to the SPA shell, which Vercel's rewrite always serves as a
    // 200 regardless of what the client-side router ends up rendering.
    if (!meta) {
      return new Response(renderHtml(notFoundMeta(url.pathname)), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response(renderHtml(meta), { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch {
    return next();
  }
}

export const config = {
  matcher: ["/plugin/:id*", "/author/:id*", "/sitemap.xml"],
};
