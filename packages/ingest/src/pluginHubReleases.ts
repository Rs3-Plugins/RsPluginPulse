import type { PluginReleaseInput } from "@rspluginpulse/db";

// Each RuneLite plugin has one file at plugins/<internalName> in this repo,
// containing `repository=`/`commit=` lines pointing at the plugin's own
// source repo. Every commit touching that one path is a re-packaging of the
// plugin into the hub -- the closest thing RuneLite plugins have to a
// release history (there's no real semver upstream, hence version is
// always null). The commit itself is almost always a squash-merge of a PR
// titled like "Update foo (#1234)" -- the changelog comes from that PR's
// own description (summary + any lists in it), not the one-line commit
// message, which is usually too terse to be useful on its own.
const REPO = "runelite/plugin-hub";
const API_BASE = "https://api.github.com";
const PAGE_SIZE = 100;

interface GithubCommit {
  sha: string;
  commit: { author: { date: string }; message: string };
}

// `since` (ISO date) is passed straight to GitHub's own commits `since`
// filter -- the API returns commits newest-first, so this stops the walk
// right at the cutoff server-side instead of paginating through years of
// history just to throw most of it away client-side.
export async function fetchPluginHubReleases(
  pluginId: number,
  internalName: string,
  token: string | undefined,
  since: string,
): Promise<PluginReleaseInput[]> {
  const releases: PluginReleaseInput[] = [];
  let url: string | null =
    `${API_BASE}/repos/${REPO}/commits?path=${encodeURIComponent(`plugins/${internalName}`)}&since=${encodeURIComponent(since)}&per_page=${PAGE_SIZE}`;
  while (url) {
    const { commits, next } = await getCommitsPage(url, token);
    for (const c of commits) {
      const message = firstLine(c.commit.message);
      const kind = classifyMessage(message);
      // "unavailable"/"disable" events never show on the frontend anyway (see
      // trendAnnotations.ts), so there's no point spending an extra API call
      // fetching a PR description nobody will see.
      const changelog = kind === "update" ? await fetchPrChangelog(c.commit.message, token) : null;
      releases.push({
        pluginId,
        source: "plugin-hub",
        sourceKey: c.sha,
        kind,
        releasedAt: c.commit.author.date,
        version: null,
        changelog,
        url: `https://github.com/${REPO}/commit/${c.sha}`,
      });
    }
    url = next;
  }
  return releases;
}

function firstLine(message: string): string {
  return message.split("\n")[0].trim();
}

// Commit titles from a squash-merge end with "(#1234)" -- take the last
// match in case the body references other issues/PRs earlier in the text.
function prNumberFromMessage(message: string): number | null {
  const matches = [...message.matchAll(/\(#(\d+)\)/g)];
  if (matches.length === 0) return null;
  return Number(matches[matches.length - 1][1]);
}

async function fetchPrChangelog(commitMessage: string, token: string | undefined): Promise<string | null> {
  const prNumber = prNumberFromMessage(commitMessage);
  if (prNumber === null) return null;
  const response = await githubGet(`${API_BASE}/repos/${REPO}/pulls/${prNumber}`, token);
  if (!response.ok) return null; // not fatal -- just no changelog for this one
  const pr = (await response.json()) as { body: string | null };
  return extractChangelogFromPrBody(pr.body);
}

// A short intro (text before any list) plus every bullet/numbered list item
// in the PR body. If the PR has no lists at all there's nothing list-like
// to show, so this returns null rather than the intro alone -- "if no lists
// exist, treat it as having no release notes."
function extractChangelogFromPrBody(body: string | null): string | null {
  if (!body) return null;
  const summaryLines: string[] = [];
  const listLines: string[] = [];
  let sawList = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || /^#{1,6}\s/.test(line) || /^<!--/.test(line)) continue;
    const bullet = line.match(/^[-*+]\s+(.*)$/);
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    const item = bullet?.[1] ?? numbered?.[1];
    if (item !== undefined) {
      sawList = true;
      listLines.push(`- ${item}`);
    } else if (!sawList) {
      summaryLines.push(line);
    }
  }
  if (!sawList) return null;
  const summary = summaryLines.slice(0, 2).join(" ").trim();
  return summary ? `${summary}\n\n${listLines.join("\n")}` : listLines.join("\n");
}

// The hub bot pulls a broken plugin with a commit literally starting
// "disable <name>" or "unavailable <name>" -- a real event (so it's still
// recorded), but not a content/version change, so it's tagged separately
// from "update". A "Revert "disable X"" (restoring availability) starts
// with "Revert", not "disable", so it's correctly left as a real update.
function classifyMessage(message: string): "update" | "unavailable" {
  const firstWord = message.split(/\s+/)[0]?.toLowerCase();
  return firstWord === "disable" || firstWord === "unavailable" ? "unavailable" : "update";
}

const MAX_RATE_LIMIT_RETRIES = 10;

// Shared by both the commits-page walk and the per-release PR-body fetch --
// same auth header and rate-limit backoff either way.
//
// Two distinct cases, handled differently:
//   - About to hit the wall (this request succeeded, but remaining is now
//     ~0): sleep after returning the (already good) response, so the *next*
//     call doesn't immediately fail -- no need to retry anything here.
//   - Already hit the wall (this request was rejected, 403/429 with
//     remaining=0 or a Retry-After header -- GitHub's primary and secondary
//     rate limits respectively): sleep until it resets, then retry this
//     exact request and resume from there, rather than surfacing the
//     rejection as a failure for whatever plugin happened to be mid-walk.
async function githubGet(url: string, token: string | undefined, attempt = 1): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });

  const remaining = Number(response.headers.get("x-ratelimit-remaining") ?? "");
  const resetAt = Number(response.headers.get("x-ratelimit-reset") ?? "");
  const retryAfterSec = Number(response.headers.get("retry-after") ?? "");
  const rejectedForRateLimit =
    (response.status === 403 || response.status === 429) && (remaining === 0 || Number.isFinite(retryAfterSec));

  if (rejectedForRateLimit) {
    if (attempt > MAX_RATE_LIMIT_RETRIES) {
      throw new Error(`GET ${url} -> still rate-limited after ${MAX_RATE_LIMIT_RETRIES} retries`);
    }
    const waitMs = Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 + 1000 : Math.max(0, resetAt * 1000 - Date.now()) + 2000;
    console.log(`  GitHub rate limit hit -- sleeping ${Math.ceil(waitMs / 1000)}s, then resuming where this left off (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES})...`);
    await sleep(waitMs);
    return githubGet(url, token, attempt + 1);
  }

  if (response.ok && Number.isFinite(remaining) && remaining <= 1 && Number.isFinite(resetAt)) {
    const waitMs = Math.max(0, resetAt * 1000 - Date.now()) + 2000;
    console.log(`  GitHub rate limit nearly exhausted (${remaining} left) -- sleeping ${Math.ceil(waitMs / 1000)}s until it resets...`);
    await sleep(waitMs);
  }

  return response;
}

async function getCommitsPage(url: string, token: string | undefined): Promise<{ commits: GithubCommit[]; next: string | null }> {
  const response = await githubGet(url, token);
  if (!response.ok) {
    throw new Error(`GET ${url} -> HTTP ${response.status}`);
  }
  const commits = (await response.json()) as GithubCommit[];
  const next = parseNextLink(response.headers.get("link"));
  return { commits, next };
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  const part = link.split(",").find((p) => p.includes('rel="next"'));
  if (!part) return null;
  const match = part.match(/<([^>]+)>/);
  return match ? match[1] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
