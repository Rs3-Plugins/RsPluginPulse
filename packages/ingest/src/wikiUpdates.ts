import type { AnnotationGameKey, GameUpdateInput } from "@rspluginpulse/db";

// Both RuneScape wikis tag every official news post in Category:Game
// updates, as a page titled "Update:<Title>" that opens with a
// {{Update|date=...|category=...|link=... or url=...}} template --
// confirmed live against both wikis while designing this. The "Update:"
// namespace's numeric id differs per wiki (112 on OSRS, 100 on RS3), so
// it's deliberately not filtered on here -- category membership plus the
// template's own category= param (checked below) already scope this
// precisely enough. generator=categorymembers + prop=revisions gets title
// and wikitext in one call, paginated newest-first via gcmcontinue.
const UPDATE_CATEGORY = "Category:Game updates";
const PAGE_LIMIT = 50;
// Safety cap on total pages walked. No early-stop-on-date is possible here
// (see the comment on fetchGameUpdates below for why), so this is the only
// thing bounding a run -- set well above either wiki's actual category
// size (confirmed via a live count while fixing this: a few hundred pages
// each), not expected to bite in practice.
const MAX_PAGES_FETCHED = 5000;
const USER_AGENT = "rspluginpulse-ingest/1.0 (https://rspluginpulse.com)";

interface WikiPage {
  pageid: number;
  title: string;
  revisions?: { slots?: { main?: { content?: string } } }[];
}

interface WikiQueryResponse {
  continue?: { gcmcontinue?: string };
  query?: { pages?: WikiPage[] };
}

async function fetchCategoryBatch(wikiHost: string, gcmcontinue: string | undefined): Promise<WikiQueryResponse> {
  const url = new URL(`https://${wikiHost}/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "categorymembers");
  url.searchParams.set("gcmtitle", UPDATE_CATEGORY);
  url.searchParams.set("gcmlimit", String(PAGE_LIMIT));
  url.searchParams.set("gcmsort", "timestamp");
  url.searchParams.set("gcmdir", "desc");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("format", "json");
  // formatversion=2 is what makes the wikitext show up as slots.main.content
  // -- the legacy (default) format buries it under a "*" key instead, and
  // returns query.pages as an object keyed by pageid rather than an array.
  url.searchParams.set("formatversion", "2");
  if (gcmcontinue) url.searchParams.set("gcmcontinue", gcmcontinue);

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${response.status}`);
  return response.json();
}

const UPDATE_TEMPLATE_RE = /\{\{\s*Update\s*\|([\s\S]*?)\}\}/i;
// Covers both wikis' spelling of the field ("Game Updates" on the RS3
// wiki, "game" on OSRS) -- anything else (lore, hidden updates, etc.) is
// skipped since only actual game updates are wanted here.
const GAME_CATEGORY_RE = /^game(\s*updates)?$/i;

function parseUpdateTemplate(wikitext: string): { date: string; category: string; link: string } | null {
  const match = UPDATE_TEMPLATE_RE.exec(wikitext);
  if (!match) return null;

  const params: Record<string, string> = {};
  for (const part of match[1].split("|")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (key) params[key] = value;
  }

  const link = params.link ?? params.url;
  if (!params.date || !params.category || !link) return null;
  return { date: params.date, category: params.category, link };
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

// {{Update}}'s date param is free text like "12 October 2026". Deliberately
// NOT parsed via `new Date(raw)` -- that reads a bare "DD Month YYYY"
// string as *local* midnight, so converting it to an ISO date shifts it by
// a day on any host whose local timezone isn't UTC (confirmed while
// building this: it did exactly that on a UTC+1 dev machine). Parsing the
// three components explicitly and building the date with Date.UTC keeps
// the result identical regardless of where this ingest script runs.
function parseWikiDate(raw: string): string | null {
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTH_NAMES.indexOf(match[2].toLowerCase());
  const year = Number(match[3]);
  if (month === -1) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// Fetches every Category:Game updates page newer than sinceDate for one
// wiki, by walking the *entire* category and filtering client-side -- no
// early-stop-once-we're-past-the-cutoff optimization is possible here.
// Neither available sort order tracks the in-template update date:
// gcmsort=timestamp is each page's last-*edit* time (an old 2020 update
// page can jump to the top of that ordering from a one-off typo fix years
// later), and the category's default/sortkey order turned out to just be
// alphabetical by title. Confirmed live while building this -- trusting
// either order to stop early falsely truncated the OSRS fetch to ~30
// entries instead of ~150. MAX_PAGES_FETCHED is the only bound now.
export async function fetchGameUpdates(wikiHost: string, game: AnnotationGameKey, sinceDate: string): Promise<GameUpdateInput[]> {
  const updates: GameUpdateInput[] = [];
  let gcmcontinue: string | undefined;
  let pagesFetched = 0;

  for (;;) {
    const data = await fetchCategoryBatch(wikiHost, gcmcontinue);
    const pages = data.query?.pages ?? [];
    pagesFetched += pages.length;

    for (const page of pages) {
      const content = page.revisions?.[0]?.slots?.main?.content;
      if (!content) continue;

      const parsed = parseUpdateTemplate(content);
      if (!parsed || !GAME_CATEGORY_RE.test(parsed.category)) continue;

      const date = parseWikiDate(parsed.date);
      if (!date || date < sinceDate) continue;

      const title = page.title.replace(/^Update:/, "");
      updates.push({
        game,
        wikiPageId: page.pageid,
        title,
        date,
        url: parsed.link,
        wikiUrl: `https://${wikiHost}/w/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      });
    }

    gcmcontinue = data.continue?.gcmcontinue;
    if (!gcmcontinue || pagesFetched >= MAX_PAGES_FETCHED) break;
  }

  return updates;
}
