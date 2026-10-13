import { getAuthorIdBySlug, getPluginIdByNameId, type GameKey } from "@rspluginpulse/db";
import { isInt4 } from "./validate";

// Numeric ids are globally unique and need no game to disambiguate (the
// original API contract, kept working unchanged); a pretty slug (a
// plugin's name_id, or an author's name slugified -- authors have no
// stored slug of their own) is only unique per game, so that path needs
// `game` to resolve. An entity whose slug happens to be all-digits
// (there's a RuneLite author literally named "117") makes the two
// ambiguous -- the numeric id is always tried first, and slug resolution
// only kicks in as a fallback once that comes up empty, rather than
// assuming digits-only always means "numeric id".
async function resolveViaSlugOrId<T>(
  idOrSlug: string,
  game: GameKey,
  load: (id: number) => Promise<T | null>,
  resolveSlug: (slug: string, game: GameKey) => Promise<number | null>,
): Promise<T | null> {
  const asNumber = Number(idOrSlug);
  let result = isInt4(asNumber) ? await load(asNumber) : null;
  if (!result) {
    const slugId = await resolveSlug(idOrSlug, game);
    if (slugId !== null) result = await load(slugId);
  }
  return result;
}

export function resolvePlugin<T>(idOrSlug: string, game: GameKey, load: (id: number) => Promise<T | null>): Promise<T | null> {
  return resolveViaSlugOrId(idOrSlug, game, load, getPluginIdByNameId);
}

export function resolveAuthor<T>(idOrSlug: string, game: GameKey, load: (id: number) => Promise<T | null>): Promise<T | null> {
  return resolveViaSlugOrId(idOrSlug, game, load, getAuthorIdBySlug);
}
