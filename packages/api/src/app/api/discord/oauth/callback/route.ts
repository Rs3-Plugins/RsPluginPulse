import { NextResponse } from "next/server";
import { INSTALL_STATE, STATE_COOKIE, clearStateCookie, exchangeCode, readCookie, setSessionCookie, startSession } from "@/lib/discordAuth";

// Discord redirects the browser here (another top-level navigation, same
// CORS-exempt reasoning as the login route) with ?code&state. Shared by
// both OAuth2 flows (login and bot-install -- see buildBotInstallUrl)
// since they're registered against the same redirect_uri; state is what
// tells them apart.
//
// For login, the state round-trip through a cookie set in /oauth/login is
// the CSRF guard -- Discord's own state value doesn't prove anything on
// its own, only that it matches what *this browser* was handed right
// before leaving for Discord's consent screen.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const webAppUrl = process.env.WEB_APP_URL ?? "/";

  // Bot-install: nothing to exchange or verify -- whether the bot actually
  // ended up installed is checked independently (fetchBotGuildIds, via the
  // bot's own token) the next time the guild list is fetched, not from
  // this redirect. Discord echoes back which guild got picked as its own
  // guild_id query param regardless of whether we pre-selected one via
  // buildBotInstallUrl -- send the browser straight to that server's own
  // page instead of the generic list, falling back to the list on the
  // off chance Discord ever omits it.
  if (state === INSTALL_STATE) {
    const guildId = searchParams.get("guild_id");
    const destination = guildId ? `/discord/servers/${guildId}` : "/discord/servers";
    return NextResponse.redirect(`${webAppUrl}${destination}`, { status: 302 });
  }

  const expectedState = readCookie(request, STATE_COOKIE);
  if (!code || !state || !expectedState || state !== expectedState) {
    const response = NextResponse.redirect(`${webAppUrl}/discord?error=state_mismatch`, { status: 302 });
    clearStateCookie(response);
    return response;
  }

  try {
    const tokens = await exchangeCode(code);
    const sessionId = await startSession(tokens);
    const response = NextResponse.redirect(`${webAppUrl}/discord/servers`, { status: 302 });
    setSessionCookie(response, sessionId);
    clearStateCookie(response);
    return response;
  } catch (error) {
    console.error("Discord OAuth callback failed:", error);
    const response = NextResponse.redirect(`${webAppUrl}/discord?error=oauth_failed`, { status: 302 });
    clearStateCookie(response);
    return response;
  }
}
