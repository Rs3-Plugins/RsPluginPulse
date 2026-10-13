import { allowedGuildTopicIntervalHours, setGuildTopicIntervalHours } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, jsonWithDiscordCors } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

// Changes this guild's channel-topic refresh cadence. Rejects anything
// outside what this guild's own subscription tier actually allows
// (checked server-side, not just hidden in the UI -- see
// @rspluginpulse/db's subscriptions.ts) rather than trusting the dashboard
// to only ever send a valid value.
export async function PUT(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  const hours = (body as { hours?: unknown } | null)?.hours;
  if (typeof hours !== "number" || !Number.isInteger(hours)) {
    return jsonWithDiscordCors(request, { error: "hours must be an integer" }, { status: 400 });
  }

  const allowed = await allowedGuildTopicIntervalHours(guildId);
  if (!allowed.includes(hours)) {
    return jsonWithDiscordCors(request, { error: "interval_not_allowed", allowedIntervals: allowed }, { status: 403 });
  }

  await setGuildTopicIntervalHours(guildId, hours);
  return jsonWithDiscordCors(request, { intervalHours: hours });
}
