import { getAuthorProfile, getLatestSnapshotTime } from "@rspluginpulse/db";
import { CACHE_CEILING, remember, rememberBriefly } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";

export const OPTIONS = corsOptions;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authorId = Number(id);
  if (!Number.isInteger(authorId)) {
    return jsonWithCors({ error: "invalid author id" }, { status: 400 });
  }

  // The author's game isn't known until getAuthorProfile resolves it, so
  // this uses the global freshness signal rather than paying for a lookup
  // just to pick a cache key.
  const freshness = (await rememberBriefly("freshness:global", () => getLatestSnapshotTime())) ?? "none";
  const author = await remember(`author:${authorId}`, CACHE_CEILING.ENTITY, freshness, () => getAuthorProfile(authorId));
  if (!author) {
    return jsonWithCors({ error: "author not found" }, { status: 404 });
  }

  return jsonWithCors(author);
}
