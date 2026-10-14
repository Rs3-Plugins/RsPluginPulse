import { addSiteAdmin, removeSiteAdmin } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeSiteAdminRequest, discordCorsOptions, jsonWithDiscordCors } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

const SNOWFLAKE = /^\d{17,20}$/;

// Site-admin-only: promotes another Discord user to site-wide mod -- a
// different, higher tier than any one guild's own discord_guild_admins
// (see schema.sql). Re-adding an existing mod just updates addedBy.
export async function PUT(request: Request, { params }: { params: Promise<{ discordUserId: string }> }) {
  const { discordUserId } = await params;
  const auth = await authorizeSiteAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  if (!SNOWFLAKE.test(discordUserId)) return jsonWithDiscordCors(request, { error: "invalid_user_id" }, { status: 400 });

  const mod = await addSiteAdmin(discordUserId, auth.session.discordUserId);
  return jsonWithDiscordCors(request, { mod });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ discordUserId: string }> }) {
  const { discordUserId } = await params;
  const auth = await authorizeSiteAdminRequest(request);
  if (auth instanceof NextResponse) return auth;

  await removeSiteAdmin(discordUserId);
  return jsonWithDiscordCors(request, { ok: true });
}
