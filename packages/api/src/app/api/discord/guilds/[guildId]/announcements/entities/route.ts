import { getAuthorProfile, getPluginInfo, listEntityAnnouncements, upsertEntityAnnouncement, type DiscordEntityAnnouncementKind, type DiscordEntityKind } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, jsonWithDiscordCors } from "@/lib/discordAuth";
import { resolveChannelAndPing } from "@/lib/announcements";
import { isInt4 } from "@/lib/validate";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

const ENTITY_KINDS = new Set<DiscordEntityKind>(["plugin", "author"]);
const ENTITY_ANNOUNCEMENT_KINDS = new Set<DiscordEntityAnnouncementKind>(["release", "update", "both"]);

// Every Per-plugin/author tab row for this guild -- "also post this
// specific plugin's (or *any* plugin by this specific author's)
// debut/updates into this specific channel", additive to whatever Global
// watch rules also happen to match it (see schema.sql's
// discord_entity_announcements comment).
export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const bindings = await listEntityAnnouncements(guildId);
  return jsonWithDiscordCors(request, { bindings });
}

// Same upsert-on-(channel,entityKind,entityId) semantics as
// channel-topics' own PUT -- re-picking the same entity+channel pairing
// replaces its settings rather than erroring or duplicating.
export async function POST(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonWithDiscordCors(request, { error: "invalid body" }, { status: 400 });

  const { entityKind, entityId, kind } = body as { entityKind?: unknown; entityId?: unknown; kind?: unknown };
  if (entityKind !== "plugin" && entityKind !== "author") return jsonWithDiscordCors(request, { error: "entityKind must be 'plugin' or 'author'" }, { status: 400 });
  if (!ENTITY_KINDS.has(entityKind)) return jsonWithDiscordCors(request, { error: "entityKind must be 'plugin' or 'author'" }, { status: 400 });
  if (typeof entityId !== "number" || !isInt4(entityId)) return jsonWithDiscordCors(request, { error: "entityId must be an integer" }, { status: 400 });
  if (!kind || !ENTITY_ANNOUNCEMENT_KINDS.has(kind as DiscordEntityAnnouncementKind)) {
    return jsonWithDiscordCors(request, { error: "kind must be 'release', 'update' or 'both'" }, { status: 400 });
  }

  let entityName: string;
  if (entityKind === "plugin") {
    const info = await getPluginInfo(entityId);
    if (!info) return jsonWithDiscordCors(request, { error: "plugin not found" }, { status: 404 });
    entityName = info.name;
  } else {
    const profile = await getAuthorProfile(entityId);
    if (!profile) return jsonWithDiscordCors(request, { error: "author not found" }, { status: 404 });
    entityName = profile.authorName;
  }

  const resolved = await resolveChannelAndPing(guildId, body as Record<string, unknown>);
  if ("error" in resolved) return jsonWithDiscordCors(request, { error: resolved.error }, { status: resolved.status });

  const binding = await upsertEntityAnnouncement({
    guildId,
    entityKind,
    entityId,
    entityName,
    kind: kind as DiscordEntityAnnouncementKind,
    ...resolved,
  });
  return jsonWithDiscordCors(request, { binding });
}
