// Pure annotation-rule logic shared between TrendChart.tsx (the plot) and
// CustomRangeCalendar.tsx (the day-picker previews) -- both need the exact
// same "what does day i mean" answer, so it lives here once rather than
// being duplicated or imported component-to-component.
//
// Ported from the design handoff (design_handoff_trend_chart/trend-chart.js
// `derive()`/`notable()`/`near()`/`ann()`), with two adaptations load-bearing
// enough to call out:
//   - the move-score/notable calculation runs against whichever metric is
//     currently displayed, not a hardcoded "daily" series -- RuneLite's
//     downloadsToday is always 0 (no real per-day figure exists upstream),
//     so hardcoding to "daily" would break marker detection entirely for
//     every RuneLite plugin.
//   - milestones keep this app's existing richer threshold ladder tied to
//     downloadsTotal specifically, regardless of the displayed metric,
//     rather than the handoff's simplified 4-threshold example.
import type { GameUpdate, PluginTrendPoint, SpecialEvent } from "../api";
import type { TrendMetric } from "../components/TrendChart";

// Days either side of a game update attributable to it. Updates land
// roughly weekly, so this must stay well under half that cadence -- at the
// old value of 3, ±3 days from a weekly update covers 6 of every 7 days,
// meaning almost every day in the series was "near" some update and got
// attributed to it regardless of whether it actually had anything to do
// with that update.
export const UPDATE_WINDOW = 1;
const SCORE_WINDOW = 5; // ±days used as the "normal" baseline for a move score
const PEAK_SUPPRESS_WINDOW = 2; // ±days: only the single biggest move in this span counts as notable
const MILESTONE_THRESHOLDS = [
  100, 500, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000,
];

export type AnnotationKind = "event" | "update";
export type EventBound = "start" | "end" | "ongoing" | null;

export interface PrimaryAnnotation {
  cat: AnnotationKind;
  event?: SpecialEvent;
  update?: GameUpdate;
  bound?: EventBound;
}

export interface Annotation {
  prim: PrimaryAnnotation | null;
  release: boolean;
  milestone: number | undefined;
}

export interface AnnotationLayers {
  ev: boolean;
  up: boolean;
  rel: boolean;
  ms: boolean;
}

export const DEFAULT_LAYERS: AnnotationLayers = { ev: true, up: true, rel: true, ms: true };

export interface ResolvedEvent {
  event: SpecialEvent;
  a: number;
  b: number;
  open: boolean;
}

export interface ResolvedUpdate {
  update: GameUpdate;
  d: number;
}

// value / median(the ±SCORE_WINDOW days around it, excluding itself) - 1.
// 0.4 means "40% above its neighbors." Matches the handoff's median pick
// exactly (upper-middle element on an even-length window, not an averaged
// median) for fidelity with the design.
export function computeScores(points: PluginTrendPoint[], metric: TrendMetric): number[] {
  const n = points.length;
  return points.map((p, i) => {
    const window: number[] = [];
    for (let j = i - SCORE_WINDOW; j <= i + SCORE_WINDOW; j++) {
      if (j !== i && j >= 0 && j < n) window.push(points[j][metric]);
    }
    if (window.length === 0) return 0;
    window.sort((a, b) => a - b);
    const mid = window[window.length >> 1];
    return mid === 0 ? 0 : p[metric] / mid - 1;
  });
}

// |score| >= threshold AND the largest |score| within ±PEAK_SUPPRESS_WINDOW
// days, so a multi-day spike gets exactly one marker instead of one per day
// along its slope.
export function computeNotable(scores: number[], threshold: number): boolean[] {
  const n = scores.length;
  return scores.map((v, i) => {
    if (Math.abs(v) < threshold) return false;
    for (let j = Math.max(0, i - PEAK_SUPPRESS_WINDOW); j <= Math.min(n - 1, i + PEAK_SUPPRESS_WINDOW); j++) {
      if (Math.abs(scores[j]) > Math.abs(v)) return false;
    }
    return true;
  });
}

// Index -> the round-number threshold first crossed that day, tied to
// downloadsTotal specifically (see the file header for why).
export function computeMilestoneMap(points: PluginTrendPoint[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const threshold of MILESTONE_THRESHOLDS) {
    for (let i = 1; i < points.length; i++) {
      if (points[i].downloadsTotal >= threshold && points[i - 1].downloadsTotal < threshold) {
        map.set(i, threshold);
        break;
      }
    }
  }
  return map;
}

// Index set where the plugin's own dateUpdated changed from the previous
// day -- null on either side (before release tracking began) never counts.
export function computeReleaseSet(points: PluginTrendPoint[]): Set<number> {
  const set = new Set<number>();
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].dateUpdated;
    const curr = points[i].dateUpdated;
    if (prev && curr && prev !== curr) set.add(i);
  }
  return set;
}

// The first index whose dateUpdated is non-null -- release tracking only
// exists from here forward for this plugin (see schema.sql's migration).
export function firstReleaseTrackedIndex(points: PluginTrendPoint[]): number | null {
  const i = points.findIndex((p) => p.dateUpdated !== null);
  return i === -1 ? null : i;
}

function nearestDateIndex(dates: string[], timeMs: number): number {
  let bestIndex = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < dates.length; i++) {
    const diff = Math.abs(new Date(dates[i]).getTime() - timeMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// Takes the series' capturedAt/day strings directly (not full PluginTrendPoint objects)
// so this can resolve events/updates against any day-indexed series -- the single-plugin
// trend chart's points, or the Compare page's shared multi-series date axis.
export function resolveEvents(dates: string[], specialEvents: SpecialEvent[] | undefined): ResolvedEvent[] {
  if (!specialEvents || specialEvents.length === 0 || dates.length === 0) return [];
  const lastIndex = dates.length - 1;
  const firstDate = dates[0].slice(0, 10);
  const lastDate = dates[lastIndex].slice(0, 10);
  const resolved: ResolvedEvent[] = [];
  for (const event of specialEvents) {
    const effectiveEnd = event.end ?? lastDate;
    if (effectiveEnd < firstDate || event.start > lastDate) continue;
    const clampedStart = event.start < firstDate ? firstDate : event.start;
    const clampedEnd = effectiveEnd > lastDate ? lastDate : effectiveEnd;
    resolved.push({
      event,
      a: nearestDateIndex(dates, new Date(clampedStart).getTime()),
      b: nearestDateIndex(dates, new Date(clampedEnd).getTime()),
      open: !event.end,
    });
  }
  return resolved;
}

export function resolveUpdates(dates: string[], gameUpdates: GameUpdate[] | undefined): ResolvedUpdate[] {
  if (!gameUpdates || gameUpdates.length === 0 || dates.length === 0) return [];
  const dayMs = 24 * 60 * 60 * 1000;
  const rangeStart = new Date(dates[0]).getTime() - dayMs;
  const rangeEnd = new Date(dates[dates.length - 1]).getTime() + dayMs;
  const resolved: ResolvedUpdate[] = [];
  for (const update of gameUpdates) {
    const t = new Date(update.date).getTime();
    if (t < rangeStart || t > rangeEnd) continue;
    resolved.push({ update, d: nearestDateIndex(dates, t) });
  }
  return resolved;
}

// Nearest resolved update within UPDATE_WINDOW days of index i; ties prefer
// the update on/before i.
function nearestUpdate(i: number, updates: ResolvedUpdate[]): ResolvedUpdate | null {
  let best: ResolvedUpdate | null = null;
  for (const u of updates) {
    const dd = Math.abs(u.d - i);
    if (dd > UPDATE_WINDOW) continue;
    if (!best || dd < Math.abs(best.d - i) || (dd === Math.abs(best.d - i) && u.d <= i)) best = u;
  }
  return best;
}

// Event > Update priority: if day i falls inside ANY event's range, that's
// the primary annotation for the *entire* range (even interior days with no
// visible marker -- see TrendChart's draw logic, which only renders a dot
// when bound is start/end/ongoing), and Update is never considered for
// those days at all. Release and Milestone are independent of this
// priority and of each other.
export function annotate(
  i: number,
  events: ResolvedEvent[],
  updates: ResolvedUpdate[],
  notable: boolean[],
  releases: Set<number>,
  milestones: Map<number, number>,
  layers: AnnotationLayers,
): Annotation {
  const event = events.find((e) => i >= e.a && i <= e.b);
  let prim: PrimaryAnnotation | null = null;
  if (event) {
    if (layers.ev) {
      const bound: EventBound = i === event.a ? "start" : i === event.b ? (event.open ? "ongoing" : "end") : null;
      prim = { cat: "event", event: event.event, bound };
    }
  } else if (notable[i] && layers.up) {
    const u = nearestUpdate(i, updates);
    if (u) prim = { cat: "update", update: u.update };
  }
  return {
    prim,
    release: layers.rel && notable[i] && releases.has(i),
    milestone: layers.ms ? milestones.get(i) : undefined,
  };
}
