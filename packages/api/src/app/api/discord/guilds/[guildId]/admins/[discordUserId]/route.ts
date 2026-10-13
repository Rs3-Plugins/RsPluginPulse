import { addGuildAdmin, removeGuildAdmin } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildAdminRequest, discordCorsOptions, jsonWithDiscordCors, requireGuildSubscription } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Discord snowflakes are 17-20 digit integers -- this is the only real
// validation possible without a live lookup, but it's enough to reject an
// obvious typo before it sits in the table as a dead admin row.
const SNOWFLAKE = /^\d{17,20}$/;

// Admin-only, and only once the guild's subscribed (see
// requireGuildSubscription -- managing *other* admins is the subscriber
// perk here, not just being one yourself): promotes another Discord user
// to admin of this guild's dashboard. There's no self-service way to
// become one otherwise. Re-adding an existing admin just updates addedBy.
export async function PUT(request: Request, { params }: { params: Promise<{ guildId: string; discordUserId: string }> }) {
  const { guildId, discordUserId } = await params;
  const auth = await authorizeGuildAdminRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;
  const subError = await requireGuildSubscription(request, guildId);
  if (subError) return subError;

  if (!SNOWFLAKE.test(discordUserId)) return jsonWithDiscordCors(request, { error: "invalid_user_id" }, { status: 400 });

  const admin = await addGuildAdmin(guildId, discordUserId, auth.session.discordUserId);
  return jsonWithDiscordCors(request, { admin });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ guildId: string; discordUserId: string }> }) {
  const { guildId, discordUserId } = await params;
  const auth = await authorizeGuildAdminRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;
  const subError = await requireGuildSubscription(request, guildId);
  if (subError) return subError;

  await removeGuildAdmin(guildId, discordUserId);
  return jsonWithDiscordCors(request, { ok: true });
}
