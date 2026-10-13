import type { GameKey } from "@rspluginpulse/db";

const GAMES: GameKey[] = ["runescape", "osrs", "runelite"];

export function parseGame(value: string | null): GameKey {
  if (value && (GAMES as string[]).includes(value)) return value as GameKey;
  return "runescape";
}
