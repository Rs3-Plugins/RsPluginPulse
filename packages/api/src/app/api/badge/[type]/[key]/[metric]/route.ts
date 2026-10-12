import { getAuthorProfile, getPlugin, getPluginTrend, getTopPlugins, type PluginTrendPoint } from "@rspluginpulse/db";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";

export const OPTIONS = corsOptions;

const PLUGIN_METRICS = ["downloads", "today", "week", "month", "subscribers", "rank"] as const;
const AUTHOR_METRICS = ["downloads", "today", "week", "plugins", "rank"] as const;
type PluginMetric = (typeof PLUGIN_METRICS)[number];
type AuthorMetric = (typeof AUTHOR_METRICS)[number];

function labelFor(metric: string, game: string): string {
  // RuneLite has no "downloads"/"subscribers" concept -- both terms mean
  // the same live install-count gauge there, so badges call it "installs".
  if (game === "runelite") {
    const RUNELITE_LABELS: Record<string, string> = {
      downloads: "installs",
      today: "installs today",
      week: "this week",
      month: "this month",
      subscribers: "installs",
      rank: "PluginPulse rank",
      plugins: "plugins",
    };
    return RUNELITE_LABELS[metric];
  }
  const LABELS: Record<string, string> = {
    downloads: "downloads",
    today: "downloads today",
    week: "this week",
    month: "this month",
    subscribers: "subscribers",
    rank: "PluginPulse rank",
    plugins: "plugins",
  };
  return LABELS[metric];
}

function compact(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(v);
}

function badgeMessage(metric: string, value: number | null): string {
  if (value === null) return "—";
  if (metric === "rank") return `#${value}`;
  const prefix = metric === "week" || metric === "month" ? "+" : "";
  return `${prefix}${compact(value)}`;
}

function findPointNearDays(points: PluginTrendPoint[], daysAgo: number): PluginTrendPoint {
  const cutoff = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  let candidate = points[0];
  for (const p of points) {
    if (new Date(p.capturedAt).getTime() <= cutoff) candidate = p;
  }
  return candidate;
}

export async function GET(_request: Request, { params }: { params: Promise<{ type: string; key: string; metric: string }> }) {
  const { type, key, metric } = await params;

  if (type !== "plugin" && type !== "author") {
    return jsonWithCors({ error: { status: 400, message: "type must be one of: plugin, author" } }, { status: 400 });
  }

  const allowed: readonly string[] = type === "plugin" ? PLUGIN_METRICS : AUTHOR_METRICS;
  if (!allowed.includes(metric)) {
    return jsonWithCors({ error: { status: 400, message: `metric ${metric} is not available for ${type} badges`, allowed } }, { status: 400 });
  }

  const id = Number(key);
  if (!Number.isInteger(id)) {
    return jsonWithCors({ error: { status: 400, message: "key must be a plugin or author id" } }, { status: 400 });
  }

  let value: number | null = null;
  let game = "rs3";

  if (type === "plugin") {
    const plugin = await getPlugin(id);
    if (!plugin) return jsonWithCors({ error: { status: 404, message: `No plugin with id ${id}` } }, { status: 404 });
    game = plugin.game;

    const m = metric as PluginMetric;
    if (m === "rank") {
      const top = await getTopPlugins("alltime", 100000, plugin.game);
      const idx = top.findIndex((p) => p.id === id);
      value = idx === -1 ? null : idx + 1;
    } else {
      const trend = await getPluginTrend(id);
      const last = trend[trend.length - 1];
      if (m === "downloads") value = last.downloadsTotal;
      else if (m === "today") value = last.downloadsToday;
      else if (m === "week") value = last.downloadsTotal - findPointNearDays(trend, 7).downloadsTotal;
      else if (m === "month") value = last.downloadsTotal - findPointNearDays(trend, 30).downloadsTotal;
      else if (m === "subscribers") value = last.subscribersTotal;
    }
  } else {
    const author = await getAuthorProfile(id);
    if (!author) return jsonWithCors({ error: { status: 404, message: `No author with id ${id}` } }, { status: 404 });
    game = author.game;

    const m = metric as AuthorMetric;
    if (m === "downloads") value = author.totals.downloadsTotal;
    else if (m === "today") value = author.totals.downloadsToday;
    else if (m === "week") value = author.totals.weeklyGain;
    else if (m === "plugins") value = author.pluginCount;
    else if (m === "rank") value = author.ranks.allTime;
  }

  return jsonWithCors(
    { schemaVersion: 1, label: labelFor(metric, game), message: badgeMessage(metric, value), color: "caa44d", cacheSeconds: 300 },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
