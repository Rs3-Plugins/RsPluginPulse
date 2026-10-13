import { getGuildAnnouncementEmbed, isGuildSubscribed, setGuildAnnouncementEmbed } from "@rspluginpulse/db";
import { NextResponse } from "next/server";
import { authorizeGuildRequest, discordCorsOptions, jsonWithDiscordCors, requireGuildSubscription } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

const MAX_TEMPLATE_LENGTH = 300;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// Readable by anyone with dashboard access (even on the free tier --
// announcements still post with these defaults, just not customizable)
// -- only the PUT below is subscription-gated. isSubscribed rides along
// so the tab knows whether to show the editable form or the locked
// upsell, same pattern as Advanced Settings.
export async function GET(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;

  const [embed, subscribed] = await Promise.all([getGuildAnnouncementEmbed(guildId), isGuildSubscribed(guildId)]);
  return jsonWithDiscordCors(request, { embed, isSubscribed: subscribed });
}

export async function PUT(request: Request, { params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const auth = await authorizeGuildRequest(request, guildId);
  if (auth instanceof NextResponse) return auth;
  const subError = await requireGuildSubscription(request, guildId);
  if (subError) return subError;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonWithDiscordCors(request, { error: "invalid body" }, { status: 400 });

  const { color, titleTemplate, descriptionTemplate, footerTemplate, showThumbnail } = body as {
    color?: unknown;
    titleTemplate?: unknown;
    descriptionTemplate?: unknown;
    footerTemplate?: unknown;
    showThumbnail?: unknown;
  };

  if (typeof color !== "string" || !COLOR_PATTERN.test(color)) return jsonWithDiscordCors(request, { error: "color must be a #rrggbb hex string" }, { status: 400 });
  if (typeof titleTemplate !== "string" || titleTemplate.trim() === "" || titleTemplate.length > MAX_TEMPLATE_LENGTH) {
    return jsonWithDiscordCors(request, { error: `titleTemplate must be 1-${MAX_TEMPLATE_LENGTH} characters` }, { status: 400 });
  }
  if (typeof descriptionTemplate !== "string" || descriptionTemplate.trim() === "" || descriptionTemplate.length > MAX_TEMPLATE_LENGTH) {
    return jsonWithDiscordCors(request, { error: `descriptionTemplate must be 1-${MAX_TEMPLATE_LENGTH} characters` }, { status: 400 });
  }
  if (typeof footerTemplate !== "string" || footerTemplate.length > MAX_TEMPLATE_LENGTH) {
    return jsonWithDiscordCors(request, { error: `footerTemplate must be ${MAX_TEMPLATE_LENGTH} characters or fewer` }, { status: 400 });
  }

  const embed = await setGuildAnnouncementEmbed(guildId, {
    color,
    titleTemplate: titleTemplate.trim(),
    descriptionTemplate: descriptionTemplate.trim(),
    footerTemplate: footerTemplate.trim(),
    showThumbnail: showThumbnail !== false,
  });
  return jsonWithDiscordCors(request, { embed });
}
