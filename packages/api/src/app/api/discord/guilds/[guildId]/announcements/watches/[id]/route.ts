import { deleteAnnouncementWatch, updateAnnouncementWatch, type DiscordAnnouncementKind } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, jsonWithDiscordCors } from "@/lib/discordAuth";
import { ANNOUNCEMENT_KINDS, GAMES, resolveChannelAndPing } from "@/lib/announcements";
import { isInt4 } from "@/lib/validate";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

export async function PUT(request: Request, { params }: { params: Promise<{ guildId: string; id: string }> }) {
  const { guildId, id } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const watchId = Number(id);
  if (!isInt4(watchId)) return jsonWithDiscordCors(request, { error: "invalid id" }, { status: 400 });

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

  const watch = await updateAnnouncementWatch(guildId, watchId, { guildId, kind: kind as DiscordAnnouncementKind, games: games as string[], ...resolved });
  if (!watch) return jsonWithDiscordCors(request, { error: "not_found" }, { status: 404 });
  return jsonWithDiscordCors(request, { watch });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ guildId: string; id: string }> }) {
  const { guildId, id } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const watchId = Number(id);
  if (!isInt4(watchId)) return jsonWithDiscordCors(request, { error: "invalid id" }, { status: 400 });

  await deleteAnnouncementWatch(guildId, watchId);
  return jsonWithDiscordCors(request, { ok: true });
}
