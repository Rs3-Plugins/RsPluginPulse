import { getRandomPluginId } from "@rspluginpulse/db";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";
import { parseGame } from "@/lib/game";

export const OPTIONS = corsOptions;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const game = parseGame(searchParams.get("game"));

  const result = await getRandomPluginId(game);
  if (result === null) {
    return jsonWithCors({ error: "no plugins found" }, { status: 404 });
  }
  return jsonWithCors(result);
}
