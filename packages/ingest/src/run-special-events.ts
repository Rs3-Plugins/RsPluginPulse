import { readFileSync } from "fs";
import { join } from "path";
import { getPool, replaceSpecialEvents, type AnnotationGameKey, type SpecialEventInput } from "@rspluginpulse/db";
import { notifyIngestFailure } from "./discordNotify";

const DATA_PATH = join(__dirname, "..", "data", "special-events.json");
// Just these two -- RuneLite and OSRS-via-mod.io are the same game, so
// OSRS entries use "oldschool" here, not "runelite"/"osrs" (see
// AnnotationGameKey in db/types.ts).
const VALID_GAMES: AnnotationGameKey[] = ["runescape", "oldschool"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RawEvent {
  game: string;
  title: string;
  start: string;
  end?: string | null;
  url?: string | null;
}

function validate(raw: RawEvent[]): SpecialEventInput[] {
  return raw.map((e, i) => {
    const label = `entry ${i}${e.title ? ` (${e.title})` : ""}`;
    if (!VALID_GAMES.includes(e.game as AnnotationGameKey)) throw new Error(`${label}: invalid game "${e.game}" (must be "runescape" or "oldschool")`);
    if (!e.title) throw new Error(`${label}: missing title`);
    if (!DATE_RE.test(e.start)) throw new Error(`${label}: start must be YYYY-MM-DD, got "${e.start}"`);
    if (e.end != null && !DATE_RE.test(e.end)) throw new Error(`${label}: end must be YYYY-MM-DD or null, got "${e.end}"`);
    if (e.end != null && e.end < e.start) throw new Error(`${label}: end (${e.end}) is before start (${e.start})`);
    if (e.url != null && !/^https?:\/\//.test(e.url)) throw new Error(`${label}: url must start with http(s):// or be null, got "${e.url}"`);
    return { game: e.game as AnnotationGameKey, title: e.title, start: e.start, end: e.end ?? null, url: e.url ?? null };
  });
}

async function main() {
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf-8")) as RawEvent[];
  const events = validate(raw);
  console.log(`read ${events.length} special events from ${DATA_PATH}`);
  const count = await replaceSpecialEvents(events);
  console.log(`special_events now has ${count} rows`);
  await getPool().end();
}

main().catch(async (error) => {
  console.error(error);
  await notifyIngestFailure("special events", error);
  process.exit(1);
});
