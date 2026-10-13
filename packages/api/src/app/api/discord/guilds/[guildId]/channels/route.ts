import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, fetchGuildChannels, jsonWithDiscordCors } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Text-capable channels in this guild, for the Channel topics tab's
// channel picker.
export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  try {
    const channels = await fetchGuildChannels(guildId);
    return jsonWithDiscordCors(request, { channels });
  } catch (error) {
    console.error(`Failed to fetch channels for ${guildId}:`, error);
    return jsonWithDiscordCors(request, { error: "discord_error" }, { status: 502 });
  }
}
