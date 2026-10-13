import { listDisabledCommands } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, jsonWithDiscordCors } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const disabled = await listDisabledCommands(guildId);
  return jsonWithDiscordCors(request, { disabled });
}
