import { grantGuildSubscription, revokeGuildSubscription } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeSiteAdminRequest, discordCorsOptions, jsonWithDiscordCors } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Site-admin-only: grants/revokes *any* guild's subscription, without
// needing Manage Server there -- a site mod manages billing across every
// guild the bot's in, not just ones they personally help run. The
// per-guild /guilds/[guildId]/subscription route still exists too, for a
// guild's own admins to self-serve the same toggle on just their guild.
export async function PUT(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeSiteAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  await grantGuildSubscription(guildId, auth.session.discordUserId);
  return jsonWithDiscordCors(request, { subscribed: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeSiteAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  await revokeGuildSubscription(guildId);
  return jsonWithDiscordCors(request, { subscribed: false });
}
