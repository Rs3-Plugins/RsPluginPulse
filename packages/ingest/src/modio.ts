import type { CoAuthorIngest, IngestedMod } from "@rspluginpulse/db";

// RuneScape's mod.io game. api_access_options is 0 (no third-party API key
// access), so this uses the same unauthenticated endpoint mod.io's own web
// client calls instead — no API key needed or possible.
const GAME_NAME_ID = "runescape";
const API_BASE = "https://mod.io/v1";
const PAGE_SIZE = 100;

export async function fetchAllMods(): Promise<IngestedMod[]> {
  const rawMods: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getModsPage(offset);
    rawMods.push(...page.data.filter((m: any) => m.visible !== 0 && m.status === 1));
    if (rawMods.length >= page.result_total || page.result_count === 0) break;
  }
  // mod.io's RuneScape catalog is small (a handful of mods, not the
  // thousands RuneLite has), so one team-roster fetch per mod plus the
  // list pages above is cheap enough to just run concurrently with no
  // throttling.
  const teams = await Promise.all(rawMods.map((mod) => fetchTeam(mod.id)));
  return rawMods.map((mod, i) => toIngestedMod(mod, teams[i]));
}

async function getModsPage(offset: number): Promise<any> {
  const url = new URL(`${API_BASE}/games/@${GAME_NAME_ID}/mods`);
  url.searchParams.set("_limit", String(PAGE_SIZE));
  url.searchParams.set("_offset", String(offset));
  url.searchParams.set("_sort", "id");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "x-modio-origin": "web" },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} -> HTTP ${response.status}`);
  }
  return response.json();
}

// mod.io's single `submitted_by` field is only the original uploader --
// mods can have a full team (co-creators, managers) with their own roster
// endpoint, same idea as RuneLite's multi-person plugin credits.
async function fetchTeam(modId: number): Promise<any[]> {
  const url = `${API_BASE}/games/@${GAME_NAME_ID}/mods/${modId}/team`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "x-modio-origin": "web" },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} -> HTTP ${response.status}`);
  }
  const json = await response.json();
  return json.data ?? [];
}

function toCoAuthor(member: any): CoAuthorIngest {
  return {
    authorId: member.user.id,
    name: member.user.username,
    avatarUrl: member.user.avatar?.thumb_100x100 ?? null,
    profileUrl: member.user.profile_url ?? `https://mod.io/u/${member.user.name_id}`,
  };
}

function toIngestedMod(mod: any, team: any[]): IngestedMod {
  const authorId = mod.submitted_by.id;
  const authorName = mod.submitted_by.username;
  const authorProfileUrl = mod.submitted_by.profile_url ?? `https://mod.io/u/${mod.submitted_by.name_id}`;
  const authorAvatarUrl = mod.submitted_by.avatar?.thumb_100x100 ?? null;
  const primary: CoAuthorIngest = { authorId, name: authorName, avatarUrl: authorAvatarUrl, profileUrl: authorProfileUrl };

  // The submitter normally appears first in their own team roster already
  // (they created it), but don't rely on that -- always put them first and
  // de-dupe the rest, same convention RuneLite's coAuthors list follows.
  const rest = team.map(toCoAuthor).filter((co) => co.authorId !== authorId);
  const coAuthors = [primary, ...rest];

  return {
    game: "runescape",
    id: mod.id,
    nameId: mod.name_id,
    name: mod.name,
    authorId,
    authorName,
    authorProfileUrl,
    authorAvatarUrl,
    coAuthors,
    profileUrl: mod.profile_url ?? `https://mod.io/g/${GAME_NAME_ID}/m/${mod.name_id}`,
    tags: (mod.tags ?? []).map((t: any) => t.name),
    logoUrl: mod.logo?.thumb_640x360 ?? mod.logo?.thumb_320x180 ?? null,
    summary: mod.summary ?? "",
    dateAdded: mod.date_added,
    dateUpdated: mod.date_updated,
    downloadsTotal: mod.stats?.downloads_total ?? 0,
    downloadsToday: mod.stats?.downloads_today ?? 0,
    subscribersTotal: mod.stats?.subscribers_total ?? 0,
    popularityRankPosition: mod.stats?.popularity_rank_position ?? null,
    ratingsTotal: mod.stats?.ratings_total ?? 0,
    ratingsPositive: mod.stats?.ratings_positive ?? 0,
    ratingsNegative: mod.stats?.ratings_negative ?? 0,
    ratingsPercentagePositive: mod.stats?.ratings_percentage_positive ?? 0,
    ratingsDisplayText: mod.stats?.ratings_display_text ?? "",
  };
}
