import { removeEntityAnnouncement } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, jsonWithDiscordCors } from "@/lib/discordAuth";
import { isInt4 } from "@/lib/validate";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// No PUT here -- editing a binding's settings (kind/ping/thumbnail) is
// just re-POSTing to .../entities with the same channelId+entityKind+
// entityId, which upserts in place (see that route's own comment). This
// only ever removes a binding outright.
export async function DELETE(request: Request, { params }: { params: Promise<{ guildId: string; id: string }> }) {
  const { guildId, id } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const bindingId = Number(id);
  if (!isInt4(bindingId)) return jsonWithDiscordCors(request, { error: "invalid id" }, { status: 400 });

  await removeEntityAnnouncement(guildId, bindingId);
  return jsonWithDiscordCors(request, { ok: true });
}
