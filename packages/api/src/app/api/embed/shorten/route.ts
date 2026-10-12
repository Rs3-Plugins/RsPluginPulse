import { createOrGetEmbedCard, type EmbedCardOptions } from "@rspluginpulse/db";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";

export const OPTIONS = corsOptions;

function parseBool(v: string | null, fallback: boolean): boolean {
  if (v === null) return fallback;
  return v !== "0" && v !== "false";
}

function parseDays(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 30;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const key = searchParams.get("key");

  if (type !== "plugin" && type !== "author") {
    return jsonWithCors({ error: { status: 400, message: "type must be one of: plugin, author" } }, { status: 400 });
  }

  const entityId = Number(key);
  if (!Number.isInteger(entityId)) {
    return jsonWithCors({ error: { status: 400, message: "key must be a plugin or author id" } }, { status: 400 });
  }

  const options: EmbedCardOptions = {
    theme: searchParams.get("theme") === "light" ? "light" : "dark",
    spark: parseBool(searchParams.get("spark"), true),
    sparkDays: parseDays(searchParams.get("sparkDays")),
    showSubtitle: parseBool(searchParams.get("showSubtitle"), true),
    showHot: parseBool(searchParams.get("showHot"), true),
    showStatDownloads: parseBool(searchParams.get("showStatDownloads"), true),
    showStatWeek: parseBool(searchParams.get("showStatWeek"), true),
    showStatThird: parseBool(searchParams.get("showStatThird"), true),
    showFooter: parseBool(searchParams.get("showFooter"), true),
    showImage: parseBool(searchParams.get("showImage"), type === "author"),
    accentColor: searchParams.get("accentColor")?.trim() ?? "",
    bgColor: searchParams.get("bgColor")?.trim() ?? "",
    textColor: searchParams.get("textColor")?.trim() ?? "",
  };

  const id = await createOrGetEmbedCard(type, entityId, options);
  return jsonWithCors({ id, path: `/api/card/${id}.png` });
}
