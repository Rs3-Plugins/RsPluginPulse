import { createAnnouncementWatch, listAnnouncementWatches, type DiscordAnnouncementKind } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, jsonWithDiscordCors } from "@/lib/discordAuth";
import { ANNOUNCEMENT_KINDS, GAMES, resolveChannelAndPing } from "@/lib/announcements";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Every Global-tab watch row for this guild (a flexible list, not fixed
// slots -- see schema.sql's discord_announcement_watches comment).
export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const watches = await listAnnouncementWatches(guildId);
  return jsonWithDiscordCors(request, { watches });
}

export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonWithDiscordCors(request, { error: "invalid body" }, { status: 400 });

  const { kind, games } = body as { kind?: unknown; games?: unknown };
  if (!kind || !ANNOUNCEMENT_KINDS.has(kind as DiscordAnnouncementKind)) {
    return jsonWithDiscordCors(request, { error: "kind must be 'release' or 'update'" }, { status: 400 });
  }
  if (!Array.isArray(games) || games.length === 0 || !games.every((g) => typeof g === "string" && GAMES.has(g))) {
    return jsonWithDiscordCors(request, { error: "games must be a non-empty subset of ['runescape','runelite']" }, { status: 400 });
  }

  const resolved = await resolveChannelAndPing(guildId, body as Record<string, unknown>);
  if ("error" in resolved) return jsonWithDiscordCors(request, { error: resolved.error }, { status: resolved.status });

  const watch = await createAnnouncementWatch({ guildId, kind: kind as DiscordAnnouncementKind, games: games as string[], ...resolved });
  return jsonWithDiscordCors(request, { watch });
}
