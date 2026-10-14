// Shared by the Global-tab watch routes (announcements/watches[/id]) and
// the Per-plugin/author tab routes (announcements/entities[/id]) -- both
// need the same channel/role validation+resolution, just attached to a
// different row shape. Not exported from a route.ts module: Next.js
// route files are only meant to export HTTP method handlers (and a short
// list of special config exports), not arbitrary helpers.
import type { AnnouncementCandidate, DiscordAnnouncementKind, DiscordPing } from "@rspluginpulse/db";
import { getAuthorProfile, getPluginInfo, getPluginReleases, getRandomPluginId } from "@rspluginpulse/db";
import { fetchGuildChannels, fetchGuildRoles } from "./discordAuth";

export const GAMES = new Set(["runescape", "runelite"]);
export const ANNOUNCEMENT_KINDS = new Set<DiscordAnnouncementKind>(["release", "update"]);

export type ValidationResult<T> = { error: string; status: number } | T;

export interface ResolvedChannelAndPing extends DiscordPing {
  channelId: string;
  channelName: string;
  showThumbnail: boolean;
}

// channelId/ping fields/showThumbnail validation+resolution common to
// both watch rows and per-plugin/author bindings -- channel and role
// names are always re-resolved from Discord here, never trusted from the
// client's own (possibly stale) display text. pingHere/pingEveryone are
// independent of pingRoleIds (any of the three can combine -- see
// schema.sql's comment on discord_announcement_watches), mutually
// exclusive only with each other.
export async function resolveChannelAndPing(
  guildId: string,
  body: { channelId?: unknown; pingHere?: unknown; pingEveryone?: unknown; pingRoleIds?: unknown; showThumbnail?: unknown },
): Promise<ValidationResult<ResolvedChannelAndPing>> {
  const { channelId, pingHere, pingEveryone, pingRoleIds, showThumbnail } = body;

  const resolvedPingHere = pingHere === true;
  const resolvedPingEveryone = pingEveryone === true;
  if (resolvedPingHere && resolvedPingEveryone) return { error: "pingHere and pingEveryone can't both be true", status: 400 };

  const requestedRoleIds = Array.isArray(pingRoleIds) ? pingRoleIds.filter((id): id is string => typeof id === "string") : [];

  if (!channelId || typeof channelId !== "string") return { error: "channelId is required", status: 400 };
  const channels = await fetchGuildChannels(guildId);
  const channel = channels.find((c) => c.id === channelId);
  if (!channel) return { error: "channel not found in this guild", status: 404 };

  let pingRoleNames: string[] = [];
  let resolvedRoleIds: string[] = [];
  if (requestedRoleIds.length > 0) {
    const roles = await fetchGuildRoles(guildId);
    const matched = requestedRoleIds.map((id) => roles.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => r !== undefined);
    if (matched.length !== requestedRoleIds.length) return { error: "one or more roles not found in this guild", status: 404 };
    resolvedRoleIds = matched.map((r) => r.id);
    pingRoleNames = matched.map((r) => r.name);
  }

  return {
    channelId,
    channelName: channel.name,
    pingHere: resolvedPingHere,
    pingEveryone: resolvedPingEveryone,
    pingRoleIds: resolvedRoleIds,
    pingRoleNames,
    showThumbnail: showThumbnail !== false,
  };
}

// For the "Test" button (open to any normal user with dashboard access,
// not admin-gated -- this is a sanity-check for a channel/embed-style
// setup someone's already allowed to edit, not a privileged power like
// the per-guild Advanced Settings refresh button). Pulls a *real* plugin
// (and, for author bindings, a real plugin by that author) out of the
// catalog so the test post actually shows a thumbnail, the author's
// profile picture, and a clickable link to the real release/profile page
// -- the same things a genuine announcement would have -- rather than the
// placeholder-only candidate this used to build. Falls back to a random
// catalog plugin for Global watches (no bound entity), and only drops to
// a fully synthetic candidate if the catalog query itself comes back
// empty (e.g. a brand-new/empty database), so the Test button still works
// rather than throwing.
export async function buildTestCandidate(
  game: string,
  kind: DiscordAnnouncementKind,
  entity?: { kind: "plugin" | "author"; id: number; name: string },
): Promise<AnnouncementCandidate> {
  let info = null as Awaited<ReturnType<typeof getPluginInfo>>;
  if (entity?.kind === "plugin") {
    info = await getPluginInfo(entity.id);
  } else if (entity?.kind === "author") {
    const profile = await getAuthorProfile(entity.id);
    const representative = profile?.plugins[0];
    if (representative) info = await getPluginInfo(representative.id);
  }
  if (!info) {
    const random = await getRandomPluginId(GAMES.has(game) ? game : "runescape");
    if (random) info = await getPluginInfo(random.id);
  }

  if (info) {
    const releases = await getPluginReleases(info.id);
    const latestRelease = releases[0] ?? null;
    return {
      kind,
      pluginId: info.id,
      pluginName: info.name,
      pluginNameId: info.nameId,
      game: info.game,
      authorName: entity?.kind === "author" ? entity.name : info.authorName,
      authorAvatarUrl: info.authorAvatarUrl,
      profileUrl: info.profileUrl,
      logoUrl: info.logoUrl,
      occurredAt: new Date(),
      version: latestRelease?.version ?? "1.0.0",
      changelog: latestRelease?.changelog ?? null,
      releaseUrl: latestRelease?.url ?? null,
    };
  }

  return {
    kind,
    pluginId: 0,
    pluginName: entity?.kind === "plugin" ? entity.name : "Example Plugin",
    pluginNameId: "example-plugin",
    game,
    authorName: entity?.kind === "author" ? entity.name : "Example Author",
    authorAvatarUrl: null,
    profileUrl: "https://rspluginpulse.com",
    logoUrl: null,
    occurredAt: new Date(),
    version: "1.0.0",
    changelog: null,
    releaseUrl: null,
  };
}

// Builds the test post's content -- a clearly-marked banner line plus the
// same mention text a real post would have, but with allowed_mentions
// left empty so it never actually notifies anyone just for a test. The
// embed itself (title/description/footer/thumbnail) is still rendered
// faithfully via renderAnnouncementEmbed elsewhere -- only the ping is
// made inert here.
export function buildTestMessageContent(ping: DiscordPing): { content: string; allowedMentions: { parse: string[]; roles: string[] } } {
  const parts: string[] = [];
  if (ping.pingEveryone) parts.push("@everyone");
  else if (ping.pingHere) parts.push("@here");
  parts.push(...ping.pingRoleIds.map((id) => `<@&${id}>`));
  const mentionLine = parts.length > 0 ? `\n${parts.join(" ")}` : "";

  return {
    content: `🧪 **Test announcement** from the PluginPulse dashboard — mentions below are shown but won't notify anyone.${mentionLine}`,
    allowedMentions: { parse: [], roles: [] },
  };
}
