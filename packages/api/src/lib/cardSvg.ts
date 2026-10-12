import { getAuthorProfile, getPlugin, getPluginTrend, getTopPlugins, type EmbedCardOptions, type EmbedCardType, type PluginTrendPoint } from "@rspluginpulse/db";
import sharp from "sharp";

interface CardPalette {
  bg: string;
  border: string;
  text: string;
  muted: string;
  dim: string;
  gold: string;
  hot: string;
}

const PALETTES: Record<"dark" | "light", CardPalette> = {
  dark: { bg: "#151514", border: "#3b3428", text: "#ece6d6", muted: "#a69e8a", dim: "#7a7262", gold: "#caa44d", hot: "#e35d6f" },
  light: { bg: "#efe8da", border: "#c1b394", text: "#1c1912", muted: "#4c4437", dim: "#5f5543", gold: "#8f6a1a", hot: "#a6192e" },
};

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Colors come straight from query params. This is hand-built SVG markup
// (served as image/svg+xml, which browsers will happily execute scripts
// in), so anything interpolated into an attribute has to be validated --
// only a bare 3/6-digit hex value is accepted, everything else is dropped.
function sanitizeHexColor(v: string): string | null {
  const clean = v.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(clean) || /^[0-9a-fA-F]{6}$/.test(clean)) return `#${clean}`;
  return null;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function findPointNearDays(points: PluginTrendPoint[], daysAgo: number): PluginTrendPoint {
  const cutoff = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  let candidate = points[0];
  for (const p of points) {
    if (new Date(p.capturedAt).getTime() <= cutoff) candidate = p;
  }
  return candidate;
}

// RuneLite has no per-day download figure -- downloadsToday is always 0
// for it (see runelite.ts), which is exactly why this sparkline used to
// render flat for every RuneLite plugin/author. Its downloadsTotal is
// already a live install gauge, not a cumulative counter, so plotting its
// day-by-day level (not a diff) is the real trend line for that game.
function dailySeriesFromTrend(trend: PluginTrendPoint[], days: number, game: string): number[] {
  const byDay = new Map<string, number>();
  for (const p of trend) byDay.set(p.capturedAt.slice(0, 10), game === "runelite" ? p.downloadsTotal : p.downloadsToday);
  const sorted = Array.from(byDay.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return sorted.slice(-days).map(([, v]) => v);
}

async function authorDailySeries(pluginIds: number[], days: number, game: string): Promise<number[]> {
  const trends = await Promise.all(pluginIds.map((id) => getPluginTrend(id)));
  const sums = new Map<string, number>();
  for (const trend of trends) {
    const byDay = new Map<string, number>();
    for (const p of trend) byDay.set(p.capturedAt.slice(0, 10), game === "runelite" ? p.downloadsTotal : p.downloadsToday);
    for (const [day, v] of byDay) sums.set(day, (sums.get(day) ?? 0) + v);
  }
  const sorted = Array.from(sums.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return sorted.slice(-days).map(([, v]) => v);
}

// Not enough real history for a meaningful line (new plugin/author, or a
// game with no daily figure at all) still draws a flat one, at whatever
// single value is known or 0 if there's none -- it's only ever omitted
// entirely via options.spark=false at the call site, never because the
// data happened to be thin.
function sparklineShapes(values: number[], width: number, height: number): { line: string; area: string } {
  const padded = values.length >= 2 ? values : values.length === 1 ? [values[0], values[0]] : [0, 0];
  const min = Math.min(...padded);
  const max = Math.max(...padded);
  const range = max - min || 1;
  const pts = padded.map((v, i) => [(i / (padded.length - 1)) * width, height - ((v - min) / range) * height] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L ${width.toFixed(1)} ${height.toFixed(1)} L 0 ${height.toFixed(1)} Z`;
  return { line, area };
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}

async function fetchImageDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 2_000_000) return null; // sanity cap, avoid bloating the card
    return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

const SPARK_DAYS_MIN = 7;
const SPARK_DAYS_MAX = 90;

export async function renderCardSvg(type: EmbedCardType, entityId: number, options: EmbedCardOptions): Promise<string | null> {
  const basePal = PALETTES[options.theme];
  const accent = sanitizeHexColor(options.accentColor);
  const bg = sanitizeHexColor(options.bgColor);
  const text = sanitizeHexColor(options.textColor);
  const pal: CardPalette = { ...basePal, gold: accent ?? basePal.gold, bg: bg ?? basePal.bg, text: text ?? basePal.text };

  const width = 400;
  const PAD = 16;
  const ICON = 36;
  const sparkDays = Math.min(SPARK_DAYS_MAX, Math.max(SPARK_DAYS_MIN, options.sparkDays || 30));

  let name: string;
  let sub: string;
  let hot: boolean;
  let statDownloads: { label: string; value: string };
  let statWeek: { label: string; value: string };
  let statThird: { label: string; value: string } | null;
  let imageUrl: string | null = null;
  let dailyValues: number[] = [];
  let game: string;

  if (type === "plugin") {
    const plugin = await getPlugin(entityId);
    if (!plugin) return null;
    const trend = await getPluginTrend(entityId);
    if (trend.length === 0) return null;
    const last = trend[trend.length - 1];
    const weekGain = last.downloadsTotal - findPointNearDays(trend, 7).downloadsTotal;
    const topHot = await getTopPlugins("hot", 100000, plugin.game);
    const hotRank = topHot.findIndex((p) => p.id === entityId);

    const downloadsLabel = plugin.game === "runelite" ? "Installs" : "Downloads";
    name = plugin.name;
    sub = `by ${plugin.authorName}`;
    hot = hotRank !== -1 && hotRank < 10;
    imageUrl = plugin.logoUrl;
    statDownloads = { label: downloadsLabel, value: last.downloadsTotal.toLocaleString() };
    statWeek = { label: "This week", value: `${weekGain >= 0 ? "+" : ""}${weekGain.toLocaleString()}` };
    // Subscribers is the exact same number as installs for RuneLite, so
    // there's no real third stat to show there.
    statThird = plugin.game === "runelite" ? null : { label: "Subscribers", value: last.subscribersTotal.toLocaleString() };
    game = plugin.game;
    if (options.spark) dailyValues = dailySeriesFromTrend(trend, sparkDays, game);
  } else {
    const author = await getAuthorProfile(entityId);
    if (!author) return null;

    const downloadsLabel = author.game === "runelite" ? "Installs" : "Downloads";
    name = author.authorName;
    sub = `${author.pluginCount} plugin${author.pluginCount === 1 ? "" : "s"}${author.ranks.allTime ? ` · #${author.ranks.allTime} all-time` : ""}`;
    hot = author.ranks.hotWeek !== null && author.ranks.hotWeek <= 5;
    imageUrl = author.authorAvatarUrl;
    statDownloads = { label: downloadsLabel, value: author.totals.downloadsTotal.toLocaleString() };
    statWeek = { label: "This week", value: `${author.totals.weeklyGain >= 0 ? "+" : ""}${author.totals.weeklyGain.toLocaleString()}` };
    // RuneLite has no daily-installs figure, so "Today" would always read 0.
    statThird = author.game === "runelite" ? null : { label: "Today", value: author.totals.downloadsToday.toLocaleString() };
    game = author.game;
    if (options.spark) dailyValues = await authorDailySeries(author.plugins.map((p) => p.id), sparkDays, game);
  }

  const stats = [
    options.showStatDownloads ? statDownloads : null,
    options.showStatWeek ? statWeek : null,
    options.showStatThird ? statThird : null,
  ].filter((s): s is { label: string; value: string } => s !== null);

  const showHotPill = options.showHot && hot;
  const imageDataUri = options.showImage && imageUrl ? await fetchImageDataUri(imageUrl) : null;

  const iconCx = PAD + ICON / 2;
  const iconCy = PAD + ICON / 2;
  const nameX = PAD + ICON + 12;

  let icon: string;
  if (imageDataUri) {
    const clipId = type === "plugin" ? "iconHexClip" : "iconCircleClip";
    const clipShape =
      type === "plugin" ? `<polygon points="${hexPoints(iconCx, iconCy, 18)}" />` : `<circle cx="${iconCx}" cy="${iconCy}" r="18" />`;
    const ring =
      type === "plugin"
        ? `<polygon points="${hexPoints(iconCx, iconCy, 18)}" fill="none" stroke="${pal.gold}" stroke-width="1.5" />`
        : `<circle cx="${iconCx}" cy="${iconCy}" r="18" fill="none" stroke="${pal.gold}" stroke-width="1.5" />`;
    icon = `<clipPath id="${clipId}">${clipShape}</clipPath>
      <image x="${iconCx - 18}" y="${iconCy - 18}" width="36" height="36" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" href="${imageDataUri}" />
      ${ring}`;
  } else if (type === "plugin") {
    icon = `<polygon points="${hexPoints(iconCx, iconCy, 17)}" fill="none" stroke="${pal.gold}" stroke-width="2" />
      <circle cx="${iconCx}" cy="${iconCy}" r="3" fill="${pal.gold}" />`;
  } else {
    icon = `<circle cx="${iconCx}" cy="${iconCy}" r="18" fill="${pal.border}" stroke="${pal.gold}" stroke-width="2" />
      <text x="${iconCx}" y="${iconCy + 5}" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="13" font-weight="700" fill="${pal.gold}">${escapeXml(initials(name))}</text>`;
  }

  const hotPillWidth = 40;
  const hotPill = showHotPill
    ? `<rect x="${width - PAD - hotPillWidth}" y="${PAD}" width="${hotPillWidth}" height="18" rx="9" fill="none" stroke="${pal.hot}" stroke-width="1" />
       <text x="${width - PAD - hotPillWidth / 2}" y="${PAD + 13}" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="10" font-weight="700" letter-spacing="0.04em" fill="${pal.hot}">HOT</text>`
    : "";

  // Cursor-based vertical layout: each section only reserves space (and a
  // trailing gap, if something follows it) when it's actually shown, so
  // turning sections off shrinks the card instead of leaving dead space.
  let y = PAD + ICON; // bottom of the icon/name row, always present
  y += 12;

  let statsBlock = "";
  if (stats.length > 0) {
    const statsTopY = y;
    // Columns keep the same width whether 1, 2 or 3 stats are shown, so
    // removing one re-centers the remaining group instead of stretching
    // it to fill the full row.
    const innerWidth = width - PAD * 2;
    const colW = innerWidth / 3;
    const blockStartX = PAD + (innerWidth - colW * stats.length) / 2;
    statsBlock = stats
      .map((s, i) => {
        // Centered within its own cell (not left-anchored at the cell's
        // edge) -- otherwise the visible text skews left of the cell
        // group's true center, most noticeably when fewer than 3 stats
        // are shown (e.g. RuneLite authors, which never get a third).
        const x = (blockStartX + i * colW + colW / 2).toFixed(1);
        return `<text x="${x}" y="${statsTopY + 12}" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="10" font-weight="700" letter-spacing="0.06em" fill="${pal.dim}">${escapeXml(s.label.toUpperCase())}</text>
                <text x="${x}" y="${statsTopY + 32}" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="17" font-weight="700" fill="${pal.text}">${escapeXml(s.value)}</text>`;
      })
      .join("\n");
    y += 40;
    if (options.spark || options.showFooter) y += 14;
  }

  const sparkWidth = width - PAD * 2;
  const sparkHeight = 40;
  const shapes = options.spark ? sparklineShapes(dailyValues, sparkWidth, sparkHeight) : null;
  let sparkBlock = "";
  if (shapes) {
    sparkBlock = `<g transform="translate(${PAD}, ${y})">
         <path d="${shapes.area}" fill="${pal.gold}" opacity="0.14" />
         <path d="${shapes.line}" fill="none" stroke="${pal.gold}" stroke-width="1.5" />
       </g>`;
    y += sparkHeight;
    if (options.showFooter) y += 14;
  }

  let footerBlock = "";
  if (options.showFooter) {
    const footerBaselineY = y + 12;
    const footerLeft = shapes ? (game === "runelite" ? `Installs · last ${sparkDays} days` : `Downloads per day · last ${sparkDays} days`) : "";
    footerBlock = `<text x="${PAD}" y="${footerBaselineY}" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="11" fill="${pal.dim}">${escapeXml(footerLeft)}</text>
      <text x="${width - PAD}" y="${footerBaselineY}" text-anchor="end" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="11" fill="${pal.dim}">rspluginpulse.com</text>`;
    y += 20;
  }

  const height = y + PAD;
  const subtitleText = options.showSubtitle ? `<text x="${nameX}" y="50" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="12" fill="${pal.muted}">${escapeXml(sub)}</text>` : "";

  // The top accent "bar" is actually the card outline's own top-left/
  // top-right quarter-circle corners (radius 10, matching the card rect
  // below) traced as a stroked path, not a clipped rect: a 2-3px-tall
  // sliver of a 10px-radius curve reads as a near-straight diagonal
  // rather than a rounded corner, so it needs the full quarter-arc.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-variant-numeric="tabular-nums">
  <defs>
    <linearGradient id="goldFade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${pal.gold}" stop-opacity="0" />
      <stop offset="12%" stop-color="${pal.gold}" stop-opacity="1" />
      <stop offset="88%" stop-color="${pal.gold}" stop-opacity="1" />
      <stop offset="100%" stop-color="${pal.gold}" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${pal.bg}" stroke="${pal.border}" />
  <path d="M 0.5 10.5 A 10 10 0 0 1 10.5 0.5 L ${width - 10.5} 0.5 A 10 10 0 0 1 ${width - 0.5} 10.5"
        fill="none" stroke="url(#goldFade)" stroke-width="2.5" stroke-linecap="round" />
  ${icon}
  <text x="${nameX}" y="32" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="16" font-weight="700" fill="${pal.text}">${escapeXml(name)}</text>
  ${subtitleText}
  ${hotPill}
  ${statsBlock}
  ${sparkBlock}
  ${footerBlock}
</svg>`;
}

// Discord (and most chat apps) don't render inline SVG in link
// previews/embeds -- treats it as a generic file instead of an image -- so
// cards ship as PNG. Rendered 1:1 with the SVG's own declared width/height
// (not at a higher density): a raster image's pixel size *is* its display
// size wherever it's embedded with no explicit width override (our own
// preview, Discord, a bare <img> tag), so doubling the pixel dimensions
// for sharpness also doubles how big it shows up everywhere.
export async function renderCardPng(type: EmbedCardType, entityId: number, options: EmbedCardOptions): Promise<Buffer | null> {
  const svg = await renderCardSvg(type, entityId, options);
  if (!svg) return null;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
