import { NextResponse } from "next/server";
import {
  DiscordApiError,
  authorizeGuildRequest,
  avatarUrl,
  discordCorsOptions,
  fetchBotMember,
  fetchBotUser,
  fetchGuildInfo,
  guildMemberAvatarUrl,
  isAvatarRateLimit,
  isMissingPermissionsError,
  jsonWithDiscordCors,
  updateBotGuildProfile,
} from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

const MAX_NICKNAME_LENGTH = 32; // Discord's own per-guild nickname limit
// ~1.5MB of actual image data once base64-decoded -- plenty for a bot
// avatar (Discord downscales these anyway) while keeping the PATCH payload
// and the request body parse small.
const MAX_AVATAR_DATA_URL_LENGTH = 2_000_000;
const AVATAR_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp|gif);base64,/;

async function loadGuildSettings(guildId: string) {
  const [guildInfo, botUser] = await Promise.all([fetchGuildInfo(guildId), fetchBotUser()]);
  const member = await fetchBotMember(guildId, botUser.id);
  const resolvedAvatarUrl = guildMemberAvatarUrl(guildId, botUser.id, member.avatar) ?? avatarUrl(botUser.id, botUser.avatar);

  return {
    guild: {
      id: guildInfo.id,
      name: guildInfo.name,
      iconUrl: guildInfo.iconUrl,
      memberCount: guildInfo.memberCount,
      botAddedAt: member.joined_at,
    },
    settings: {
      nickname: member.nick,
      avatarUrl: resolvedAvatarUrl,
      hasCustomAvatar: Boolean(member.avatar),
    },
  };
}

// Header info (name/icon/member count/bot-added-since) plus the General
// tab's current settings for one guild -- gated to signed-in users with
// Manage Server there and only once the bot's actually a member (see
// requireManageableGuild).
export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  try {
    return jsonWithDiscordCors(request, await loadGuildSettings(guildId));
  } catch (error) {
    console.error(`Failed to load guild settings for ${guildId}:`, error);
    return jsonWithDiscordCors(request, { error: "discord_error" }, { status: 502 });
  }
}

// nickname/avatarDataUrl are pushed straight to Discord's own guild member
// object for the bot -- nothing here is mirrored into our own DB, Discord
// is the sole source of truth. Any field omitted from the body is left
// untouched.
export async function PATCH(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonWithDiscordCors(request, { error: "invalid body" }, { status: 400 });

  const { nickname, avatarDataUrl } = body as { nickname?: string | null; avatarDataUrl?: string | null };

  if (nickname !== undefined && nickname !== null && nickname.length > MAX_NICKNAME_LENGTH) {
    return jsonWithDiscordCors(request, { error: `nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer` }, { status: 400 });
  }
  if (avatarDataUrl !== undefined && avatarDataUrl !== null) {
    if (avatarDataUrl.length > MAX_AVATAR_DATA_URL_LENGTH || !AVATAR_DATA_URL_PATTERN.test(avatarDataUrl)) {
      return jsonWithDiscordCors(request, { error: "avatar must be a png/jpeg/webp/gif image under ~1.5MB" }, { status: 400 });
    }
  }

  try {
    if (nickname !== undefined || avatarDataUrl !== undefined) {
      const patch: { nick?: string | null; avatar?: string | null } = {};
      if (nickname !== undefined) patch.nick = nickname === "" ? null : nickname;
      if (avatarDataUrl !== undefined) patch.avatar = avatarDataUrl;
      await updateBotGuildProfile(guildId, patch);
    }
    return jsonWithDiscordCors(request, await loadGuildSettings(guildId));
  } catch (error) {
    console.error(`Failed to update guild settings for ${guildId}:`, error);
    // Discord's own per-app avatar-change rate limit (not the general REST
    // one) -- comes back as a 400 with a specific error shape rather than
    // a 429, so it needs its own code so the dashboard can explain what
    // actually happened instead of a generic "something went wrong".
    if (error instanceof DiscordApiError && isAvatarRateLimit(error.body)) {
      return jsonWithDiscordCors(request, { error: "avatar_rate_limited" }, { status: 429 });
    }
    // Nickname changes need Change Nickname (added to the invite's
    // requested permissions alongside Manage Channels) -- a server that
    // installed the bot before that was added won't have it granted yet.
    if (error instanceof DiscordApiError && isMissingPermissionsError(error.body)) {
      return jsonWithDiscordCors(request, { error: "missing_permissions" }, { status: 403 });
    }
    return jsonWithDiscordCors(request, { error: "discord_error" }, { status: 502 });
  }
}
