import { NextResponse } from "next/server";
import { buildBotInstallUrl } from "@/lib/discordAuth";

// The bot-install OAuth2 flow (bot + applications.commands scopes) --
// separate from /oauth/login's identify+guilds "Log in with Discord" one.
// Reached via a real top-level navigation ("Add to Discord" does
// `window.location.href = ...`), same CORS-exempt reasoning as /oauth/login.
// An optional ?guild_id= pre-selects that server in Discord's own picker
// (see buildBotInstallUrl), used by the per-guild "Invite" button on
// /discord/servers.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const guildId = searchParams.get("guild_id") ?? undefined;
  return NextResponse.redirect(buildBotInstallUrl(guildId), { status: 302 });
}
