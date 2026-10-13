// Shared by packages/discord-bot's hourly worker *and* the dashboard's
// admin-only manual "Refresh now" route (packages/api) -- both need to
// turn a binding into the exact same topic text, so this lives here
// rather than being duplicated (or, worse, drifting apart) between the two
// packages. Mirrors packages/web/src/discord/tabs/ChannelTopicsTab.tsx's
// own placeholderValues/fillTemplate -- that's a *preview* of this exact
// output, so the placeholder vocabulary and formatting have to stay in
// sync with both.
import { getAuthorProfile, getPluginInfo } from "./queries";
import type { DiscordChannelTopic } from "./types";

function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(n);
}

function fmtSigned(n: number): string {
  if (n > 0) return `+${fmt(n)}`;
  if (n < 0) return `-${fmt(Math.abs(n))}`;
  return "0";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

// Returns null when the bound entity no longer exists (e.g. a plugin got
// delisted) -- the caller skips that binding rather than pushing a broken
// topic or crashing over one stale row.
//
// {rank}'s value includes its own leading "#" ("#180") -- so a template
// just dropping in the {rank} chip reads right without the person having
// to remember to type "#" themselves. DEFAULT_TEMPLATE in
// ChannelTopicsTab.tsx relies on this (no literal "#" of its own before
// "{rank}") -- don't add one there, that's what produced "##180"
// (silently masked for RuneLite plugins until getPluginInfo's rank
// computation was fixed to work for them too, since the value was always
// "—" there before).
export async function renderChannelTopicText(binding: DiscordChannelTopic): Promise<string | null> {
  if (binding.entityKind === "plugin") {
    const info = await getPluginInfo(binding.entityId);
    if (!info) return null;
    return fillTemplate(binding.template, {
      name: info.name,
      author: info.authorName,
      installs: fmt(info.downloadsTotal),
      today: fmt(info.downloadsToday),
      subscribers: fmt(info.subscribersTotal),
      rank: info.popularityRankPosition ? `#${info.popularityRankPosition}` : "—",
      rating: info.ratingsDisplayText || "Unrated",
      updated: fmtDate(info.dateUpdated),
      game: info.game,
    });
  }
  const profile = await getAuthorProfile(binding.entityId);
  if (!profile) return null;
  return fillTemplate(binding.template, {
    name: profile.authorName,
    plugins: String(profile.pluginCount),
    installs: fmt(profile.totals.downloadsTotal),
    today: fmt(profile.totals.downloadsToday),
    weekly: fmtSigned(profile.totals.weeklyGain),
    rank: profile.ranks.allTime ? `#${profile.ranks.allTime}` : "—",
    since: fmtDate(profile.publishingSince),
    game: profile.game,
  });
}
