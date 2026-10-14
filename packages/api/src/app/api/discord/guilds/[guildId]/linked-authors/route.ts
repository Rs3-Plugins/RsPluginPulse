import { NextResponse } from "next/server";
import { getAllAuthorLinks } from "@rspluginpulse/db";
import { authorizeGuildRequest, discordCorsOptions, fetchGuildMember, jsonWithDiscordCors } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

interface MergedLink {
  runescape: string | null;
  runelite: string | null;
  linkedAt: string;
}

// Reads the whole discord_author_links table (it has no guild_id of its
// own -- a link follows the Discord user into every server the bot is in,
// see the table's own comment in schema.sql) and filters it down to just
// this guild's current members, one live membership lookup per distinct
// linked user. Fine to do in full at this feature's current scale (same
// reasoning as getAllAuthorLinks's own comment); revisit with a cached
// membership list if the table ever grows large enough for that to matter.
export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const allLinks = await getAllAuthorLinks();
  const byUser = new Map<string, MergedLink>();
  for (const link of allLinks) {
    const merged = byUser.get(link.discordUserId) ?? { runescape: null, runelite: null, linkedAt: link.linkedAt };
    merged[link.game] = link.authorName;
    if (link.linkedAt < merged.linkedAt) merged.linkedAt = link.linkedAt;
    byUser.set(link.discordUserId, merged);
  }

  try {
    const resolved = await Promise.all(
      [...byUser.entries()].map(async ([discordUserId, merged]) => {
        const member = await fetchGuildMember(guildId, discordUserId);
        if (!member) return null; // not (or no longer) a member of this guild
        return { discordUserId, username: member.username, avatarUrl: member.avatarUrl, ...merged };
      }),
    );
    const links = resolved.filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => a.linkedAt.localeCompare(b.linkedAt));
    return jsonWithDiscordCors(request, { links });
  } catch (error) {
    console.error(`Failed to resolve linked authors for guild ${guildId}:`, error);
    return jsonWithDiscordCors(request, { error: "discord_error" }, { status: 502 });
  }
}
