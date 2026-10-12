import { searchPluginsAndAuthors } from "@rspluginpulse/db";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const game = parseGame(searchParams.get("game"));
  const rawLimit = searchParams.get("limit");
  const pluginLimit = rawLimit ? Math.min(Math.max(Number(rawLimit) || 6, 1), 20) : undefined;
  const authorLimit = pluginLimit ? Math.max(1, Math.round(pluginLimit * (4 / 6))) : undefined;

  const result = await searchPluginsAndAuthors(game, q, pluginLimit, authorLimit);
  return jsonWithCors(result);
}
