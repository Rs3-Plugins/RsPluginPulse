import { SESSION_COOKIE, avatarUrl, discordCorsOptions, getLiveSession, isCallerSiteAdmin, jsonWithDiscordCors, readCookie } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

export async function GET(request: Request) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  const session = sessionId ? await getLiveSession(sessionId) : null;
  if (!session) return jsonWithDiscordCors(request, { signedIn: false });

  // isSiteAdmin rides along here (instead of a separate round trip) since
  // /me is already fetched once on every page load (DiscordAuthContext) --
  // ProfileMenu.tsx uses it to decide whether to show "Admin Management"
  // at all.
  return jsonWithDiscordCors(request, {
    signedIn: true,
    user: {
      id: session.discordUserId,
      username: session.username,
      avatarUrl: avatarUrl(session.discordUserId, session.avatarHash),
      isSiteAdmin: await isCallerSiteAdmin(session),
    },
  });
}
