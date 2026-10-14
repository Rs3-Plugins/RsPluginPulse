import {
  DiscordApiError,
  SESSION_COOKIE,
  discordCorsOptions,
  endSession,
  fetchBotGuildIds,
  fetchUserGuilds,
  getLiveSession,
  jsonWithDiscordCors,
  readCookie,
  toManageableGuilds,
} from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Every guild the signed-in user owns or has Manage Server on, each tagged
// with whether the bot's actually installed there -- see toManageableGuilds.
export async function GET(request: Request) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  const session = sessionId ? await getLiveSession(sessionId) : null;
  if (!session) return jsonWithDiscordCors(request, { error: "not signed in" }, { status: 401 });

  let userGuilds;
  try {
    userGuilds = await fetchUserGuilds(session.accessToken);
  } catch (error) {
    console.error(`Discord guild fetch failed for session ${session.id}:`, error);
    // Only a genuine 401 means Discord actually rejected this access
    // token (e.g. the user revoked the app's access directly in their
    // Discord settings) -- that really is a dead session. This endpoint
    // is also rate-limited fairly aggressively, and a 429 (or any
    // 5xx/network blip) says nothing about the session itself; treating
    // those as fatal too used to delete a perfectly live session over a
    // routine rate limit.
    if (error instanceof DiscordApiError && error.status === 401) {
      await endSession(session.id);
      return jsonWithDiscordCors(request, { error: "not signed in" }, { status: 401 });
    }
    return jsonWithDiscordCors(request, { error: "discord_error" }, { status: 502 });
  }

  let botGuildIds;
  try {
    botGuildIds = await fetchBotGuildIds();
  } catch (error) {
    // Not the user's fault -- DISCORD_BOT_TOKEN missing/invalid, or
    // Discord's API having a bad moment. The session is still perfectly
    // valid, so this must not touch it.
    console.error("Bot guild fetch failed:", error);
    return jsonWithDiscordCors(request, { error: "server misconfigured" }, { status: 502 });
  }

  return jsonWithDiscordCors(request, { guilds: toManageableGuilds(userGuilds, botGuildIds) });
}
