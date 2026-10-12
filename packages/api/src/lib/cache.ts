// In-memory response cache for the hot read endpoints (leaderboard, stats,
// badges, search's trending view). This process serves everything from one
// instance behind one nginx (see deploy/README.md) -- no multi-instance
// deploy, so there's nothing a shared cache like Redis would buy here that
// a plain Map doesn't. Entries just expire on a TTL tied to how often
// ingest actually refreshes the data (hourly) rather than being invalidated
// by ingest directly -- ingest runs as a separate CLI process/cron timer,
// not inside this server, so there's no in-process signal to invalidate on.
interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

// Bounds memory from the long tail of per-entity keys (one per plugin/
// author id ever looked up) -- sweeps anything already expired rather than
// letting them sit forever. Runs lazily off cache activity, not a timer.
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

function sweepExpired(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

// Classic cache-aside: return the cached value if it's still fresh,
// otherwise compute, store, and return it. Concurrent callers for the same
// cold key will each compute independently (acceptable at this scale --
// the point is cutting repeat load across *requests over time*, not
// de-duplicating a thundering herd within the same millisecond).
export async function remember<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  sweepExpired(now);

  const existing = store.get(key);
  if (existing && existing.expiresAt > now) return existing.value as T;

  const value = await compute();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export const CACHE_TTL = {
  // Leaderboard/stats: expensive aggregation queries, and the data itself
  // only moves when ingest runs (hourly) -- see deploy/configure.sh.
  LEADERBOARD: 10 * 60_000,
  // Badges are hit repeatedly by shields.io for the exact same id+metric
  // every time a page embedding one loads -- shorter TTL since a badge is
  // meant to look "live", but still collapses a lot of repeat traffic.
  BADGE: 5 * 60_000,
  // Per-entity pages (a specific plugin/author) -- shorter than the
  // leaderboard since any one of thousands of ids is less likely to be
  // requested again soon, so there's less to gain from a long TTL.
  ENTITY: 5 * 60_000,
  // The empty-query "trending" view is the one search response every
  // visitor's first keystroke-less open hits -- everything else is too
  // high-cardinality (arbitrary query text) to be worth caching.
  SEARCH_TRENDING: 10 * 60_000,
} as const;
