import type { Game } from "../context/GameContext";

// Pretty URLs use the entity's slug (e.g. /plugin/117hd) instead of its
// numeric id. Slugs are only unique per game (a few collide across
// mod.io/RuneLite), so anything other than the default game needs to carry
// `?game=` along for the API to resolve it -- rs3 is the implicit default,
// so it's left off to keep the common case's URL clean.
export function pluginHref(nameId: string, game: Game): string {
  return game === "rs3" ? `/plugin/${nameId}` : `/plugin/${nameId}?game=${game}`;
}

export function authorHref(nameId: string, game: Game): string {
  return game === "rs3" ? `/author/${nameId}` : `/author/${nameId}?game=${game}`;
}
