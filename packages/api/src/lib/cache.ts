// In-memory response cache for the hot read endpoints (leaderboard, stats,
// badges, search's trending view). This process serves everything from one
// instance behind one nginx (see deploy/README.md) -- no multi-instance
// deploy, so there's nothing a shared cache like Redis would buy here that
// a plain Map doesn't.
//
// Entries are validated against `freshnessKey` (the caller passes in
// something like the latest snapshot timestamp for the relevant game) --
// NOT a short blind TTL. Ingest runs as a separate CLI process/cron timer
// (hourly, see deploy/configure.sh), not inside this server, so there's no
// in-process signal to invalidate *on*; but the data an entry depends on
// only actually changes once that freshness key changes, so a flat 5-10min
// TTL was just recomputing the exact same result 6-12 times an hour for no
// reason. `ceilingTtlMs` is only a safety bound (ingest running very late,
// or the freshness probe itself failing) -- it should be well over the
// ingest interval, not under it.
interface Entry {
  value: unknown;
  freshnessKey: string;
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

// Cache-aside, validated by freshnessKey rather than time alone: a cached
// entry is only reused if the key matches what it was stored with (the
// data hasn't moved) *and* it's under the ceiling TTL. Concurrent callers
// for the same cold key each compute independently (acceptable at this
// scale -- the point is cutting repeat load across *requests over time*,
// not de-duplicating a thundering herd within the same millisecond).
export async function remember<T>(key: string, ceilingTtlMs: number, freshnessKey: string, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  sweepExpired(now);

  const existing = store.get(key);
  if (existing && existing.expiresAt > now && existing.freshnessKey === freshnessKey) {
    return existing.value as T;
  }

  const value = await compute();
  store.set(key, { value, freshnessKey, expiresAt: now + ceilingTtlMs });
  return value;
}

// Safety ceilings only -- comfortably longer than the hourly ingest
// interval so a late or skipped ingest run doesn't matter, but still short
// enough that a stuck freshness probe can't pin stale data forever.
export const CACHE_CEILING = {
  LEADERBOARD: 3 * 60 * 60_000,
  BADGE: 3 * 60 * 60_000,
  ENTITY: 3 * 60 * 60_000,
  SEARCH_TRENDING: 3 * 60 * 60_000,
} as const;

// A short, flat-TTL memoizer for the freshness *probe* itself (currently
// "latest ingested snapshot time", used both as /api/status's own answer
// and as the freshnessKey every other cached route above validates
// against). This is NOT the same as `remember` -- there's no freshness key
// to validate against here, since this signal IS the freshness key. It
// exists because the probe query turned out to not be cheap once filtered
// by game (a join + seq scan across every snapshot row, ~100-200ms on
// this dataset, since plugin_snapshots has no game column of its own) --
// paying that on literally every request, including cache hits, defeated
// the point. A 30s staleness window on "how recent is the data" is
// unnoticeable; ingest only moves this number once an hour.
const freshnessProbes = new Map<string, { value: unknown; expiresAt: number }>();
const FRESHNESS_PROBE_TTL_MS = 30_000;

export async function rememberBriefly<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = freshnessProbes.get(key);
  if (existing && existing.expiresAt > now) return existing.value as T;
  const value = await compute();
  freshnessProbes.set(key, { value, expiresAt: now + FRESHNESS_PROBE_TTL_MS });
  return value;
}
