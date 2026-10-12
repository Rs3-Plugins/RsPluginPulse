import { getAuthorProfile } from "@rspluginpulse/db";
import { CACHE_TTL, remember } from "@/lib/cache";
import { jsonWithCors, OPTIONS as corsOptions } from "@/lib/cors";

export const OPTIONS = corsOptions;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authorId = Number(id);
  if (!Number.isInteger(authorId)) {
    return jsonWithCors({ error: "invalid author id" }, { status: 400 });
  }

  const author = await remember(`author:${authorId}`, CACHE_TTL.ENTITY, () => getAuthorProfile(authorId));
  if (!author) {
    return jsonWithCors({ error: "author not found" }, { status: 404 });
  }

  return jsonWithCors(author);
}
