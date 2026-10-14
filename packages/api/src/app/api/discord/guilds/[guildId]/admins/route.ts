import { getGuildSubscription, listGuildAdmins } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildAdminRequest, discordCorsOptions, fetchDiscordUserById, jsonWithDiscordCors } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Admin-only: the full admin panel's read side -- who's an admin (and who
// added them), plus this guild's subscription status (and who granted
// it). Also resolves every discord_user_id involved to a username/avatar
// (fetchDiscordUserById works for any account, not just guild members),
// since a raw snowflake isn't something an admin can actually recognize.
export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildAdminRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const [admins, subscription] = await Promise.all([listGuildAdmins(guildId), getGuildSubscription(guildId)]);

  const userIds = new Set<string>();
  for (const admin of admins) {
    userIds.add(admin.discordUserId);
    userIds.add(admin.addedBy);
  }
  if (subscription) userIds.add(subscription.grantedBy);

  const resolved = await Promise.all(
    [...userIds].map(async (id) => [id, await fetchDiscordUserById(id).catch(() => null)] as const),
  );
  const users = Object.fromEntries(resolved);

  return jsonWithDiscordCors(request, { admins, isOwner: auth.isOwner, subscribed: subscription !== null, subscription, users });
}
