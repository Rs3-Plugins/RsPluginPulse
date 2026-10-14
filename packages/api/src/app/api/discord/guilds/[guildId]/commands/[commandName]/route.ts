import { setCommandEnabled } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, jsonWithDiscordCors } from "@/lib/discordAuth";
import { TOGGLEABLE_COMMANDS } from "@/lib/discordCommands";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// PUT re-enables (deletes the "disabled" row, see discord_command_toggles'
// own schema.sql comment); DELETE disables (inserts one). Same Manage
// Server gate as channel-topics/announcements writes, not the stricter
// subscription-gated admin tier -- this isn't a paid feature.
export async function PUT(request: Request, { params }: { params: Promise<{ guildId: string; commandName: string }> }) {
  const { guildId, commandName } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;
  if (!TOGGLEABLE_COMMANDS.has(commandName)) return jsonWithDiscordCors(request, { error: "unknown_command" }, { status: 400 });

  await setCommandEnabled(guildId, commandName, true);
  return jsonWithDiscordCors(request, { ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ guildId: string; commandName: string }> }) {
  const { guildId, commandName } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;
  if (!TOGGLEABLE_COMMANDS.has(commandName)) return jsonWithDiscordCors(request, { error: "unknown_command" }, { status: 400 });

  await setCommandEnabled(guildId, commandName, false);
  return jsonWithDiscordCors(request, { ok: true });
}
