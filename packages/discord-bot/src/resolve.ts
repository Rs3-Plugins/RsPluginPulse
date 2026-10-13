// Turns whatever a user typed/picked into a plugin.ts/author.ts command
// option into a concrete DB id. Autocomplete (see each command's own
// autocomplete()) sets a suggestion's value to the entity's numeric id, so
// a user who picked a suggestion hits the id branch directly; a user who
// typed free text and hit enter without picking one falls through to a
// live search and takes the best (highest-downloads) match, same ranking
// searchPluginsAndAuthors already uses for the site's own header search.
import { getAuthorProfile, getPlugin, searchPluginsAndAuthors } from "@rspluginpulse/db";

export async function resolvePluginId(game: string, raw: string): Promise<number | null> {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const plugin = await getPlugin(Number(trimmed));
    if (plugin) return plugin.id;
  }
  const result = await searchPluginsAndAuthors(game, trimmed, 1, 0);
  return result.plugins[0]?.id ?? null;
}

export async function resolveAuthorId(game: string, raw: string): Promise<number | null> {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const profile = await getAuthorProfile(Number(trimmed));
    if (profile) return profile.authorId;
  }
  const result = await searchPluginsAndAuthors(game, trimmed, 0, 1);
  return result.authors[0]?.id ?? null;
}
