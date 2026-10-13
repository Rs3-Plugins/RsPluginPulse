import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { GameUpdate, PluginTrendPoint, SpecialEvent } from "../api";
import type { Game } from "../context/GameContext";
import {
  annotate,
  computeMilestoneMap,
  computeNotable,
  computeReleaseSet,
  computeScores,
  DEFAULT_LAYERS,
  firstReleaseTrackedIndex,
  resolveEvents,
  resolveUpdates,
  type Annotation,
  type AnnotationLayers,
} from "../lib/trendAnnotations";
import { ChartSettingsMenu } from "./ChartSettingsMenu";
import { CustomRangeCalendar } from "./CustomRangeCalendar";

export type TrendMetric = "downloadsTotal" | "downloadsToday" | "subscribersTotal";
export type ChartType = "line" | "bar";
export type RangeKey = "7" | "30" | "all" | "custom";

// RuneLite has no separate "downloads"/"subscribers" concepts -- both
// fields hold the same live install-count gauge, so everything there is
// just labelled "installs" instead.
export function trendMetrics(game: Game): { key: TrendMetric; label: string; unit: string }[] {
  if (game === "runelite") {
    return [
      { key: "downloadsTotal", label: "Total installs", unit: "installs" },
      { key: "downloadsToday", label: "Installs today", unit: "installs" },
      { key: "subscribersTotal", label: "Installs", unit: "installs" },
    ];
  }
  return [
    { key: "downloadsTotal", label: "Total downloads", unit: "downloads" },
    { key: "downloadsToday", label: "Downloads today", unit: "downloads" },
    { key: "subscribersTotal", label: "Subscribers", unit: "subscribers" },
  ];
}

interface Props {
  points: PluginTrendPoint[]; // full history, one point per day -- TrendChart owns all windowing/zoom itself
  metric: TrendMetric; // which series is plotted/displayed
  // Which series "notability" (the move score behind every marker type) is
  // computed from -- deliberately separate from `metric` above. For RS3/
  // mod.io plugins downloadsTotal is an ever-growing cumulative number (a
  // day going from 100,000 to 100,500 is only +0.5%, so it almost never
  // crosses even a low sensitivity threshold) -- the real day-to-day
  // momentum lives in downloadsToday. RuneLite is the opposite: its
  // downloadsTotal is actually a live fluctuating install gauge (not
  // cumulative, see runelite.ts), so that one swings meaningfully day to
  // day, while its downloadsToday is always 0. So this is chosen by game,
  // not by whichever metric tile happens to be selected for display.
  scoreMetric: TrendMetric;
  metricLabel: string; // e.g. "Total downloads" -- chart header title
  unit: string; // e.g. "downloads" -- tooltip/axis unit text
  pluginName: string; // export filename
  initialParams: URLSearchParams; // read once, on mount
  onParamsChange: (patch: Record<string, string | null>) => void;
  gameUpdates?: GameUpdate[];
  specialEvents?: SpecialEvent[];
}

interface Win {
  a: number;
  b: number;
}

const MINW = 6; // smallest zoom window, as a b-a span (7 days inclusive)
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayDate(points: PluginTrendPoint[], i: number): Date {
  return new Date(points[Math.max(0, Math.min(points.length - 1, i))].capturedAt);
}
function dShort(points: PluginTrendPoint[], i: number): string {
  const d = dayDate(points, i);
  return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function dLong(points: PluginTrendPoint[], i: number): string {
  const d = dayDate(points, i);
  return `${WD[d.getUTCDay()]}, ${dShort(points, i)}, ${d.getUTCFullYear()}`;
}
// "Apr 19 – Oct 12, 2026" when both ends share a year, "Apr 19, 2025 – Oct
// 12, 2026" when the range crosses a year boundary -- otherwise a
// multi-year range silently reads as if it were a few months long.
function dRange(points: PluginTrendPoint[], a: number, b: number): string {
  const ya = dayDate(points, a).getUTCFullYear();
  const yb = dayDate(points, b).getUTCFullYear();
  if (ya === yb) return `${dShort(points, a)} – ${dShort(points, b)}, ${yb}`;
  return `${dShort(points, a)}, ${ya} – ${dShort(points, b)}, ${yb}`;
}
function isoDay(points: PluginTrendPoint[], i: number): string {
  return points[Math.max(0, Math.min(points.length - 1, i))].capturedAt.slice(0, 10);
}
function indexForIso(points: PluginTrendPoint[], iso: string): number {
  if (points.length === 0) return 0;
  const t = Date.parse(iso + "T00:00:00.000Z");
  let best = 0,
    bestDiff = Infinity;
  for (let i = 0; i < points.length; i++) {
    const diff = Math.abs(new Date(points[i].capturedAt).getTime() - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}
function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function short(n: number): string {
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(Math.round(n));
}
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
function niceScale(a: number, b: number, count: number): { a: number; b: number; ticks: number[] } {
  const span = b - a || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw) ?? 10 * mag;
  const lo = Math.floor(a / step) * step;
  const hi = Math.ceil(b / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);
  return { a: lo, b: hi, ticks };
}

function readIntParam(params: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const n = Number(params.get(key));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}
function readBoolParam(params: URLSearchParams, key: string): boolean {
  return params.get(key) !== "0";
}

export function TrendChart({ points, metric, scoreMetric, metricLabel, unit, pluginName, initialParams, onParamsChange, gameUpdates, specialEvents }: Props) {
  // ---------- State (read once from the URL on mount, same as the design handoff) ----------
  const initial = useRef(initialParams).current;
  const [chartType, setChartType] = useState<ChartType>(initial.get("chart") === "bar" ? "bar" : "line");
  const [range, setRange] = useState<RangeKey>(() => {
    const r = initial.get("range");
    return r === "7" || r === "30" || r === "all" || r === "custom" ? r : "30";
  });
  const [zoom, setZoomState] = useState<Win | null>(() => {
    const from = initial.get("from"),
      to = initial.get("to");
    if (!from || !to || points.length === 0) return null;
    const a = Math.max(0, indexForIso(points, from)),
      b = Math.min(points.length - 1, indexForIso(points, to));
    return b - a >= (initial.get("range") === "custom" ? 1 : MINW) ? { a, b } : null;
  });
  const [sel, setSel] = useState<Win | null>(() => {
    const s = initial.get("sel");
    if (!s || points.length === 0) return null;
    const [from, to] = s.split("_");
    if (!from || !to) return null;
    const a = Math.max(0, indexForIso(points, from)),
      b = Math.min(points.length - 1, indexForIso(points, to));
    return b > a ? { a, b } : null;
  });
  const [layers, setLayers] = useState<AnnotationLayers>(() => ({
    ev: readBoolParam(initial, "ev"),
    up: readBoolParam(initial, "up"),
    rel: readBoolParam(initial, "rel"),
    ms: readBoolParam(initial, "ms"),
  }));
  const [sens, setSens] = useState(() => readIntParam(initial, "sens", 1, 0, 150));

  const [hover, setHover] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<"pan" | "sel" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [width, setWidth] = useState(900);

  const plotRef = useRef<HTMLDivElement>(null);
  const rangeAnchorRef = useRef<HTMLDivElement>(null);
  const settingsAnchorRef = useRef<HTMLDivElement>(null);

  // ---------- URL sync ----------
  useEffect(() => {
    if (dragMode) return; // don't thrash the URL mid-drag
    onParamsChange({
      chart: chartType !== "line" ? chartType : null,
      range: range !== "30" ? range : null,
      sens: sens !== 1 ? String(sens) : null,
      ev: layers.ev ? null : "0",
      up: layers.up ? null : "0",
      rel: layers.rel ? null : "0",
      ms: layers.ms ? null : "0",
      from: zoom ? isoDay(points, zoom.a) : null,
      to: zoom ? isoDay(points, zoom.b) : null,
      sel: sel ? `${isoDay(points, sel.a)}_${isoDay(points, sel.b)}` : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, range, sens, layers, zoom, sel, dragMode]);

  // ---------- Window / zoom ----------
  const lastIndex = points.length - 1;
  const win = useMemo((): Win => {
    if (zoom) return zoom;
    if (range === "all" || range === "custom") return { a: 0, b: lastIndex };
    const span = range === "7" ? 7 : 30;
    return { a: Math.max(0, lastIndex - span + 1), b: lastIndex };
  }, [zoom, range, lastIndex]);

  function setWin(a: number, w: number) {
    w = Math.round(Math.max(MINW, Math.min(lastIndex, w)));
    if (w >= lastIndex) {
      setZoomState(null);
      setRange("all");
      return;
    }
    a = Math.max(0, Math.min(lastIndex - w, Math.round(a)));
    setZoomState((z) => (!z || z.a !== a || z.b !== a + w ? { a, b: a + w } : z));
  }
  function zoomBy(factor: number, center?: number) {
    const { a, b } = win,
      w = b - a;
    const c = center ?? (a + b) / 2;
    const nw = Math.max(MINW, Math.min(lastIndex, Math.round(w * factor)));
    if (nw === w) return;
    setWin(c - ((c - a) * nw) / w, nw);
  }

  // ---------- Annotation data (recomputed off the full history + active metric) ----------
  const scores = useMemo(() => computeScores(points, scoreMetric), [points, scoreMetric]);
  const notable = useMemo(() => computeNotable(scores, sens / 100), [scores, sens]);
  const milestoneMap = useMemo(() => computeMilestoneMap(points), [points]);
  const releaseSet = useMemo(() => computeReleaseSet(points), [points]);
  const releaseFromIndex = useMemo(() => firstReleaseTrackedIndex(points), [points]);
  const dates = useMemo(() => points.map((p) => p.capturedAt), [points]);
  const events = useMemo(() => resolveEvents(dates, specialEvents), [dates, specialEvents]);
  const updates = useMemo(() => resolveUpdates(dates, gameUpdates), [dates, gameUpdates]);
  const ann = (i: number): Annotation => annotate(i, events, updates, notable, releaseSet, milestoneMap, layers);

  // ---------- Resize ----------
  useEffect(() => {
    const el = plotRef.current;
    if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------- Popovers: outside click / Escape ----------
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (settingsOpen && settingsAnchorRef.current && !settingsAnchorRef.current.contains(e.target as Node)) setSettingsOpen(false);
      if (calOpen && rangeAnchorRef.current && !rangeAnchorRef.current.contains(e.target as Node)) setCalOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (calOpen) setCalOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
      else if (sel) setSel(null);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen, calOpen, sel]);

  // ---------- Pointer / wheel interaction (native listeners -- wheel needs { passive: false } for preventDefault, which React's onWheel can't guarantee) ----------
  const geomRef = useRef<{ a: number; b: number; n: number; ml: number; pw: number } | null>(null);
  const activeLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    let drag: { x: number; a: number; w: number; n: number; pw: number; moved: boolean; shift: boolean; si: number; mode: "pan" | "sel" | null } | null = null;
    let justDragged = false;

    function idxAt(clientX: number): number {
      const g = geomRef.current;
      if (!g || !el) return 0;
      const r = el.getBoundingClientRect();
      return Math.max(g.a, Math.min(g.b, g.a + ((clientX - r.left - g.ml) / g.pw) * (g.n - 1)));
    }

    function onDown(e: PointerEvent) {
      if (e.button !== 0 || !geomRef.current) return;
      const g = geomRef.current;
      drag = { x: e.clientX, a: g.a, w: g.b - g.a, n: g.n, pw: g.pw, moved: false, shift: e.shiftKey, si: Math.round(idxAt(e.clientX)), mode: null };
    }
    function onMove(e: PointerEvent) {
      if (!geomRef.current || !el) return;
      if (drag) {
        const dx = e.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) > 4 && (!drag.shift || drag.w < lastIndex)) {
          drag.moved = true;
          drag.mode = drag.shift ? "pan" : "sel";
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* no-op */
          }
          setDragMode(drag.mode);
          setHover(null);
        }
        if (drag.moved) {
          if (drag.mode === "pan") setWin(drag.a - (dx / drag.pw) * (drag.n - 1), drag.w);
          else {
            const c = Math.round(idxAt(e.clientX));
            setSel({ a: Math.min(drag.si, c), b: Math.max(drag.si, c) });
          }
          return;
        }
      }
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const g = geomRef.current;
      let hv: number | null = null;
      if (x >= g.ml - 6 && x <= g.ml + g.pw + 6) hv = Math.max(g.a, Math.min(g.b, g.a + Math.round(((x - g.ml) / g.pw) * (g.n - 1))));
      setHover(hv);
    }
    function endDrag() {
      const d = drag;
      drag = null;
      if (d && d.moved) {
        justDragged = true;
        setTimeout(() => {
          justDragged = false;
        }, 0);
        setDragMode(null);
        setSel((s) => (s && s.a === s.b ? null : s));
      }
    }
    function onClick() {
      if (justDragged) return;
      if (activeLinkRef.current) window.open(activeLinkRef.current, "_blank", "noopener,noreferrer");
      else setSel(null);
    }
    function onWheel(e: WheelEvent) {
      if (!geomRef.current) return;
      const g = geomRef.current;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomBy(e.deltaY > 0 ? 1.2 : 1 / 1.2, idxAt(e.clientX));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && g.b - g.a < lastIndex) {
        e.preventDefault();
        setWin(g.a + (e.deltaX / g.pw) * (g.n - 1), g.b - g.a);
      }
    }
    function onLeave() {
      if (!drag) setHover(null);
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("click", onClick);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("click", onClick);
      el.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIndex]);

  // ---------- Layout ----------
  const mobile = width < 640;
  const bar = chartType === "bar";
  const W = Math.max(300, width);
  const H = mobile ? 300 : 360;
  const ml = mobile ? 46 : 56;
  const mr = mobile ? 10 : 16;
  const mt = 30;
  const showLane = layers.rel || layers.ev;
  const laneH = showLane ? 22 : 0;
  const mb = (showLane ? laneH + 8 : 0) + 28;
  const pw = W - ml - mr;
  const ph = H - mt - mb;
  const base = mt + ph;
  const laneY = base + 6;
  const bottom = showLane ? laneY + laneH : base;

  const { a: lo, b: hi } = win;
  const n = hi - lo + 1;
  const scale = useMemo(() => {
    let mn = Infinity,
      mx = -Infinity;
    for (let i = lo; i <= hi; i++) {
      mn = Math.min(mn, points[i][metric]);
      mx = Math.max(mx, points[i][metric]);
    }
    const zeroBased = bar || metric === "downloadsToday";
    return niceScale(zeroBased ? 0 : mn, mx, mobile ? 4 : 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi, metric, bar, mobile, points]);

  const X = (i: number) => ml + (n > 1 ? ((i - lo) / (n - 1)) * pw : 0.5 * pw);
  const Y = (v: number) => mt + ph * (1 - (v - scale.a) / (scale.b - scale.a || 1));
  geomRef.current = { a: lo, b: hi, n, ml, pw };

  const h = hover !== null && hover >= lo && hover <= hi ? hover : null;
  const releaseFromVisible = releaseFromIndex !== null && releaseFromIndex > lo;

  // ---------- Markers ----------
  const markers = useMemo(() => {
    const ms: { i: number; threshold: number }[] = [];
    const ev: { i: number; bound: "start" | "end" | "ongoing" }[] = [];
    const up: number[] = [];
    const rel: number[] = [];
    for (let i = lo; i <= hi; i++) {
      const a = ann(i);
      if (a.milestone !== undefined) ms.push({ i, threshold: a.milestone });
      if (a.prim?.cat === "event" && a.prim.bound) ev.push({ i, bound: a.prim.bound });
      if (a.prim?.cat === "update") up.push(i);
      if (a.release) rel.push(i);
    }
    return { ms, ev, up, rel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi, events, updates, notable, releaseSet, milestoneMap, layers]);
  const markerCount = markers.up.length + markers.ev.length + markers.rel.length;

  // ---------- Timeline lane fill (contiguous same-category day runs, merged into
  // one rect each so an event's whole span fills solid rather than only its ends) ----------
  const laneFill = useMemo(() => {
    if (!showLane) return [];
    const dayHalf = n > 1 ? pw / (n - 1) / 2 : pw / 2;
    const segs: { x1: number; x2: number; cls: "ev" | "rel" }[] = [];
    let curCls: "ev" | "rel" | null = null;
    let curStart = lo;
    const push = (endIndex: number) => {
      if (!curCls) return;
      const x1 = Math.max(ml, X(curStart) - dayHalf);
      const x2 = Math.min(ml + pw, X(endIndex) + dayHalf);
      if (x2 > x1) segs.push({ x1, x2, cls: curCls });
    };
    for (let i = lo; i <= hi; i++) {
      const a = ann(i);
      // Priority Event > Release: an event's shaded range matters most for context, a
      // release is a hard fact about the plugin itself. Update is excluded from the
      // lane fill/markers entirely -- kept only on the series line.
      const cls: "ev" | "rel" | null = a.prim?.cat === "event" ? "ev" : a.release ? "rel" : null;
      if (cls !== curCls) {
        push(i - 1);
        curCls = cls;
        curStart = i;
      }
    }
    push(hi);
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi, n, pw, ml, showLane, events, updates, notable, releaseSet, layers]);

  // Tell the native click handler (see the pointer-event effect above)
  // whether the hovered day has a link, via a ref rather than re-running
  // that effect (and re-subscribing every listener) on every hover change.
  const hoveredAnn = h !== null ? ann(h) : null;
  const hoveredLink = hoveredAnn?.prim ? (hoveredAnn.prim.cat === "event" ? hoveredAnn.prim.event?.url ?? null : hoveredAnn.prim.update?.url ?? null) : null;
  activeLinkRef.current = dragMode ? null : hoveredLink;

  function openCalendar() {
    setCalOpen((o) => !o);
    setSettingsOpen(false);
  }
  function applyCustomRange(a: number, b: number) {
    setRange("custom");
    setZoomState({ a, b });
    setCalOpen(false);
    setHover(null);
    setSel(null);
  }
  function resetZoom() {
    setZoomState(null);
    setHover(null);
    setRange((r) => (r === "custom" ? "all" : r));
  }
  function zoomToSelection() {
    if (!sel) return;
    const { a, b } = sel;
    setSel(null);
    setWin(a, b - a);
  }

  // Guarded until here (not an early return before the hooks above) so
  // every useState/useMemo/useEffect call above still runs on every
  // render regardless of whether points is empty -- bailing out earlier
  // would call a different number of hooks between an empty and a
  // non-empty render of the same mounted instance, which breaks React's
  // rules of hooks.
  if (points.length === 0) {
    return (
      <section className="ppc">
        <div className="ppc-plotwrap">
          <p>No snapshots in this range.</p>
        </div>
      </section>
    );
  }

  const arr = (i: number) => points[i][metric];
  const lastX = X(hi),
    lastY = Y(arr(hi));

  return (
    <section className="ppc" aria-label="Download history">
      <header className="ppc-head">
        <div className="ppc-heading">
          <span className="ppc-title">{metricLabel}</span>
          <span className="ppc-sub">
            {dRange(points, lo, hi)} · {plural(n, "day")}
          </span>
        </div>
        <div className="ppc-controls">
          <div className="ppc-anchor" ref={rangeAnchorRef}>
            <div className="ppc-seg" role="radiogroup" aria-label="Range">
              {(["7", "30", "all"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={range === k && !zoom}
                  onClick={() => {
                    setRange(k);
                    setZoomState(null);
                    setHover(null);
                    setCalOpen(false);
                  }}
                >
                  {k === "all" ? "All" : `${k}D`}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={range === "custom"} aria-haspopup="dialog" aria-expanded={calOpen} onClick={openCalendar}>
                <CalIcon />
                Custom
              </button>
            </div>
            {calOpen && (
              <CustomRangeCalendar
                points={points}
                metric={scoreMetric}
                events={events}
                updates={updates}
                notable={notable}
                releaseSet={releaseSet}
                milestoneMap={milestoneMap}
                layers={layers}
                currentRange={range === "custom" && zoom ? zoom : null}
                anchorRef={rangeAnchorRef}
                onApply={applyCustomRange}
                onCancel={() => setCalOpen(false)}
              />
            )}
          </div>

          <div className="ppc-seg" role="group" aria-label="Zoom">
            <button type="button" className="ppc-icon" aria-label="Zoom out" title="Zoom out" disabled={hi - lo >= lastIndex} onClick={() => zoomBy(1 / 0.6)}>
              <ZoomOutIcon />
            </button>
            <button type="button" className="ppc-icon" aria-label="Zoom in" title="Zoom in" disabled={hi - lo <= MINW} onClick={() => zoomBy(0.6)}>
              <ZoomInIcon />
            </button>
            <button type="button" className="ppc-reset" aria-label="Reset zoom" disabled={!zoom} onClick={resetZoom}>
              Reset
            </button>
          </div>

          <div className="ppc-anchor" ref={settingsAnchorRef}>
            <ChartSettingsMenu
              open={settingsOpen}
              onToggle={() => {
                setSettingsOpen((o) => !o);
                setCalOpen(false);
              }}
              chartType={chartType}
              onChartTypeChange={setChartType}
              layers={layers}
              onLayersChange={setLayers}
              releaseFromLabel={releaseFromIndex !== null ? `Tracked since ${dShort(points, releaseFromIndex)}, ${dayDate(points, releaseFromIndex).getUTCFullYear()}` : "Not tracked yet"}
              sens={sens}
              onSensChange={setSens}
              markerCount={markerCount}
              onExport={(kind) => exportTrend(points, win, ann, pluginName, kind)}
            />
          </div>
        </div>
      </header>

      <div className="ppc-plotwrap">
        <div
          ref={plotRef}
          className={`ppc-plot ${hoveredLink && !dragMode ? "is-link" : ""} ${dragMode === "pan" ? "is-panning" : ""}`}
          style={{ height: H }}
        >
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Download history chart">
            <defs>
              <linearGradient id="ppcArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--gold)" stopOpacity={0.22} />
                <stop offset="1" stopColor="var(--gold)" stopOpacity={0} />
              </linearGradient>
              <pattern id="ppcHatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={6} stroke="var(--line)" strokeWidth={2} />
              </pattern>
            </defs>

            {/* Event shading + boundaries */}
            {layers.ev &&
              events.map((e, k) => {
                if (e.b < lo || e.a > hi) return null;
                const x1 = e.a < lo ? ml : X(e.a);
                const x2 = e.b > hi ? ml + pw : X(e.b);
                const w = Math.max(2, x2 - x1);
                return (
                  <g key={k}>
                    <rect className="ppc-s-band" x={x1} y={6} width={w} height={base - 6} />
                    <rect className="ppc-s-bandtop" x={x1} y={6} width={w} height={2} />
                    {e.a >= lo && <line className="ppc-s-bound" x1={X(e.a)} x2={X(e.a)} y1={6} y2={base} />}
                    {e.b <= hi && <line className={`ppc-s-bound${e.open ? " is-open" : ""}`} x1={X(e.b)} x2={X(e.b)} y1={6} y2={base} />}
                  </g>
                );
              })}

            {scale.ticks.map((v) => (
              <line key={v} className="ppc-s-grid" x1={ml} x2={ml + pw} y1={Y(v)} y2={Y(v)} />
            ))}

            {bar ? (
              (() => {
                const bw = Math.max(1, (pw / n) * (n > 120 ? 0.72 : 0.6));
                return (
                  <>
                    {Array.from({ length: n }, (_, k) => lo + k).map((i) => (
                      <rect
                        key={i}
                        className={`ppc-s-bar${h === null ? "" : i === h ? " is-hot" : " is-dim"}`}
                        x={X(i) - bw / 2}
                        y={Y(arr(i))}
                        width={bw}
                        height={Math.max(0, base - Y(arr(i)))}
                        rx={1}
                      />
                    ))}
                  </>
                );
              })()
            ) : (
              <>
                <path
                  d={`M${X(lo)},${base}L${Array.from({ length: n }, (_, k) => lo + k)
                    .map((i) => `${X(i).toFixed(1)},${Y(arr(i)).toFixed(1)}`)
                    .join("L")}L${X(hi)},${base}Z`}
                  fill="url(#ppcArea)"
                />
                <path
                  className="ppc-s-line"
                  d={`M${Array.from({ length: n }, (_, k) => lo + k)
                    .map((i) => `${X(i).toFixed(1)},${Y(arr(i)).toFixed(1)}`)
                    .join("L")}`}
                />
              </>
            )}
            <line className="ppc-s-base" x1={ml} x2={ml + pw} y1={base} y2={base} />

            {sel && sel.b > sel.a && sel.b >= lo && sel.a <= hi && (
              <>
                {(() => {
                  const xa = sel.a < lo ? X(lo) : X(sel.a);
                  const xb = sel.b > hi ? ml + pw : X(sel.b);
                  return (
                    <>
                      <rect className="ppc-s-shade" x={ml} y={6} width={Math.max(0, xa - ml)} height={bottom - 6} />
                      <rect className="ppc-s-shade" x={xb} y={6} width={Math.max(0, ml + pw - xb)} height={bottom - 6} />
                      {sel.a >= lo && <line className="ppc-s-seledge" x1={xa} x2={xa} y1={6} y2={bottom} />}
                      {sel.b <= hi && <line className="ppc-s-seledge" x1={xb} x2={xb} y1={6} y2={bottom} />}
                    </>
                  );
                })()}
              </>
            )}

            {showLane && (
              <>
                <rect className="ppc-s-lane" x={ml} y={laneY} width={pw} height={laneH} rx={3} />
                {laneFill.map((s, k) => (
                  <rect key={k} className={`ppc-lanefill ppc-lanefill--${s.cls}`} x={s.x1} y={laneY} width={s.x2 - s.x1} height={laneH} />
                ))}
                {layers.rel && releaseFromVisible && releaseFromIndex !== null && (
                  <rect x={ml} y={laneY} width={Math.max(0, Math.min(pw, X(releaseFromIndex) - ml))} height={laneH} rx={3} fill="url(#ppcHatch)" />
                )}
              </>
            )}
            {h !== null && <line className="ppc-s-cross" x1={X(h)} x2={X(h)} y1={mt} y2={bottom} />}

            {/* Markers, in draw order: milestone, event, update, release -- event/update/release
                are drawn twice: once on the series at their value's y (so they read against the
                trend itself), and once in the shared timeline lane below (so they're all visible
                together regardless of chart type/zoom level cutting off the series). */}
            {layers.ms &&
              markers.ms.map(({ i, threshold }) => (
                <path key={`ms-${i}`} className="ppc-m-ms" d={`M${X(i)},${Y(arr(i)) - 5.5}L${X(i) + 5.5},${Y(arr(i))}L${X(i)},${Y(arr(i)) + 5.5}L${X(i) - 5.5},${Y(arr(i))}Z`} />
              ))}
            {layers.ev &&
              markers.ev.map(({ i, bound }) =>
                bound === "ongoing" ? (
                  <path key={`ev-${i}`} className="ppc-m-evopen" d={`M${X(i) - 4},${Y(arr(i)) - 6}L${X(i) + 5},${Y(arr(i))}L${X(i) - 4},${Y(arr(i)) + 6}Z`} />
                ) : (
                  <circle key={`ev-${i}`} className="ppc-m-ev" cx={X(i)} cy={Y(arr(i))} r={4.5} />
                ),
              )}
            {layers.up && markers.up.map((i) => <circle key={`up-${i}`} className="ppc-m-up" cx={X(i)} cy={Y(arr(i))} r={4.5} />)}
            {layers.rel && markers.rel.map((i) => <rect key={`rel-${i}`} className="ppc-m-rel" x={X(i) - 4} y={laneY + laneH / 2 - 4} width={8} height={8} rx={2} />)}
            {layers.ev && markers.ev.map(({ i }) => <circle key={`lane-ev-${i}`} className="ppc-m-ev" cx={X(i)} cy={laneY + laneH / 2} r={4} />)}

            {h !== null && !bar && <circle className="ppc-s-dot" cx={X(h)} cy={Y(arr(h))} r={4.5} />}
          </svg>

          {/* y axis */}
          {scale.ticks.map((v) => (
            <div key={v} className="ppc-axis ppc-axis--y" style={{ top: Y(v) - 8, width: ml - 8 }}>
              {short(v)}
            </div>
          ))}
          {/* event labels */}
          {layers.ev &&
            events.map((e, k) => {
              if (e.b < lo || e.a > hi) return null;
              const x1 = e.a < lo ? ml : X(e.a);
              const x2 = e.b > hi ? ml + pw : X(e.b);
              const w = Math.max(2, x2 - x1);
              if (w <= 28) return null;
              return (
                <div key={k} className="ppc-band-label" style={{ left: x1 + 6, maxWidth: w - 10 }}>
                  {(e.a < lo ? "← " : "") + e.event.title + (e.open ? " · ongoing →" : "")}
                </div>
              );
            })}
          {showLane && (
            <div className="ppc-lane-label" style={{ top: laneY + 6, width: ml - 8 }}>
              Timeline
            </div>
          )}
          {layers.rel && releaseFromVisible && releaseFromIndex !== null && X(releaseFromIndex) - ml > 150 && (
            <div className="ppc-hatch-label" style={{ left: ml + 8, top: laneY + 4 }}>
              No release data before {dShort(points, releaseFromIndex)}
            </div>
          )}
          {/* x axis */}
          {(() => {
            const step = Math.max(1, Math.ceil(n / (mobile ? 4 : 7)));
            const out = [];
            for (let i = hi; i >= lo; i -= step) {
              out.push(
                <div
                  key={i}
                  className="ppc-axis"
                  style={{ left: X(i), top: base + (showLane ? laneH + 12 : 6), transform: i === hi ? "translateX(-100%)" : "translateX(-50%)" }}
                >
                  {dShort(points, i)}
                </div>,
              );
            }
            return out;
          })()}

          {h !== null && (
            <Tooltip points={points} index={h} metric={metric} unit={unit} score={scores[h]} notableHere={notable[h]} ann={ann(h)} hx={X(h)} top={mt} width={W} mobile={mobile} />
          )}
        </div>
        <div className="ppc-hint">
          {mobile ? "Drag across the chart to inspect a period" : "Drag to inspect a period · Shift + drag to pan · Ctrl/⌘ + scroll or pinch to zoom"}
        </div>
      </div>

      {sel && sel.b > sel.a && <SelectionBar points={points} sel={sel} metric={scoreMetric} ann={ann} onZoom={zoomToSelection} onClear={() => setSel(null)} />}

      <KeyFooter />
    </section>
  );
}

// ---------- Tooltip ----------
function Tooltip({
  points,
  index,
  metric,
  unit,
  score,
  notableHere,
  ann,
  hx,
  top,
  width,
  mobile,
}: {
  points: PluginTrendPoint[];
  index: number;
  metric: TrendMetric;
  unit: string;
  score: number;
  notableHere: boolean;
  ann: Annotation;
  hx: number;
  top: number;
  width: number;
  mobile: boolean;
}) {
  const tw = mobile ? 236 : 272;
  const flip = hx > width - tw - 24;
  const blocks: ReactElement[] = [];

  if (ann.prim) {
    const isEvent = ann.prim.cat === "event";
    const url = isEvent ? ann.prim.event?.url ?? null : ann.prim.update?.url ?? null;
    const title = isEvent ? ann.prim.event?.title ?? "" : ann.prim.update?.title ?? "";
    let head: string, meta: string;
    if (isEvent && ann.prim.event) {
      const ev = ann.prim.event;
      const evA = indexForIsoInPoints(points, ev.start);
      const evB = ev.end ? indexForIsoInPoints(points, ev.end) : points.length - 1;
      const range = `${dShort(points, evA)} – ${ev.end ? dShort(points, evB) : "ongoing"}`;
      head = "Likely tied to";
      meta =
        ann.prim.bound === "start"
          ? `Event began this day · ${range}`
          : ann.prim.bound === "end"
            ? `Event ended this day · ${range}`
            : ann.prim.bound === "ongoing"
              ? "Still running · latest tracked day"
              : `Day ${index - evA + 1} of event · ${range}`;
    } else if (ann.prim.update) {
      const d = indexForIsoInPoints(points, ann.prim.update.date);
      head = "Possibly tied to";
      meta =
        d === index
          ? "Game update · same day"
          : d < index
            ? `Game update · ${plural(index - d, "day")} after, on ${dShort(points, d)}`
            : `Game update · ${plural(d - index, "day")} before, on ${dShort(points, d)}`;
    } else {
      head = "";
      meta = "";
    }
    const chipClass = isEvent ? "event" : ann.prim.cat;
    const chipLabel = isEvent ? "Event" : "Update";
    blocks.push(
      <div className="ppc-tip-block" key="prim">
        <div className="ppc-tip-blockhead">
          <span className={`ppc-chip ppc-chip--${chipClass}`}>{chipLabel}</span>
          {head}
        </div>
        <div className="ppc-tip-title">{title}</div>
        <div className="ppc-tip-meta">{meta}</div>
        <div className={`ppc-tip-link${url ? "" : " is-none"}`}>
          {url ? (isEvent ? "Click to open event page ↗" : "Click to read update post ↗") : isEvent ? "No event page linked" : "No post linked"}
        </div>
      </div>,
    );
  }
  if (ann.release) {
    blocks.push(
      <div className="ppc-tip-block" key="rel">
        <div className="ppc-tip-blockhead">
          <span className="ppc-chip ppc-chip--release">Release</span>
          Plugin change
        </div>
        <div className="ppc-tip-title">Plugin updated this day</div>
        <div className="ppc-tip-meta">New version detected on mod.io</div>
      </div>,
    );
  }
  if (ann.milestone !== undefined) {
    blocks.push(
      <div className="ppc-tip-block" key="ms">
        <div className="ppc-tip-blockhead">
          <span className="ppc-chip ppc-chip--milestone">Milestone</span>
          Total downloads
        </div>
        <div className="ppc-tip-title">Passed {fmt(ann.milestone)} downloads</div>
        <div className="ppc-tip-meta">{fmt(points[index].downloadsTotal)} total by end of day</div>
      </div>,
    );
  }

  const move = notableHere ? (
    <div className={`ppc-tip-move ${score > 0 ? "ppc-is-up" : "ppc-is-down"}`}>
      {score > 0 ? "▲ " : "▼ "}
      {Math.round(Math.abs(score) * 100)}% {score > 0 ? "above" : "below"} nearby days
    </div>
  ) : null;

  return (
    <div
      className="ppc-tip"
      role="tooltip"
      style={{ left: hx, top, width: tw, transform: flip ? "translate(calc(-100% - 14px),0)" : "translate(14px,0)" }}
    >
      <div className="ppc-tip-main">
        <div className="ppc-tip-date">{dLong(points, index)}</div>
        <div className="ppc-tip-val">
          <strong>{fmt(points[index][metric])}</strong>
          <span>{metric === "downloadsTotal" ? "total downloads" : `${unit} that day`}</span>
        </div>
        {move}
      </div>
      {blocks}
    </div>
  );
}

function indexForIsoInPoints(points: PluginTrendPoint[], iso: string): number {
  return indexForIso(points, iso.slice(0, 10));
}

// ---------- Selected-period summary ----------
function SelectionBar({
  points,
  sel,
  metric,
  ann,
  onZoom,
  onClear,
}: {
  points: PluginTrendPoint[];
  sel: Win;
  metric: TrendMetric;
  ann: (i: number) => Annotation;
  onZoom: () => void;
  onClear: () => void;
}) {
  const { a, b } = sel;
  const len = b - a + 1;
  // downloadsToday is a true daily amount, so summing it across the period gives a real
  // "downloads in this period" figure. downloadsTotal/subscribersTotal are running levels
  // (snapshots of a running count) -- summing those just adds up N near-identical big
  // numbers, which reads as a huge, meaningless total. For those, show the net change
  // (end level minus the level just before the period) instead.
  const isFlow = metric === "downloadsToday";
  const sum = (x: number, y: number) => {
    let t = 0;
    for (let i = x; i <= y; i++) t += points[i][metric];
    return t;
  };
  const total = sum(a, b);
  const baseline = a > 0 ? points[a - 1][metric] : points[a][metric];
  const netChange = points[b][metric] - baseline;
  let peak = a;
  for (let i = a; i <= b; i++) if (points[i][metric] > points[peak][metric]) peak = i;
  const prevStart = a - len;
  const prevTotal = prevStart >= 0 ? sum(prevStart, a - 1) : null;
  const pct = prevTotal !== null && prevTotal > 0 ? total / prevTotal - 1 : null;

  const eventIds = new Set<string>();
  let updateCount = 0,
    releaseCount = 0,
    msCount = 0;
  for (let i = a; i <= b; i++) {
    const an = ann(i);
    if (an.prim) {
      if (an.prim.cat === "event" && an.prim.event) eventIds.add(String(an.prim.event.id));
      else if (an.prim.cat === "update") updateCount++;
    }
    if (an.release) releaseCount++;
    if (an.milestone !== undefined) msCount++;
  }
  const parts: string[] = [];
  if (eventIds.size) parts.push(plural(eventIds.size, "event"));
  if (updateCount) parts.push(plural(updateCount, "update"));
  if (releaseCount) parts.push(plural(releaseCount, "release"));
  if (msCount) parts.push(plural(msCount, "milestone"));

  return (
    <div className="ppc-selbar">
      <Stat label="Selected period" value={`${dShort(points, a)} – ${dShort(points, b)} · ${plural(len, "day")}`} cls="is-gold" />
      {isFlow ? (
        <Stat label="Downloads" value={fmt(total)} />
      ) : (
        <Stat
          label="Net change"
          value={`${netChange >= 0 ? "+" : "−"}${fmt(Math.abs(netChange))}`}
          cls={netChange >= 0 ? "ppc-is-up" : "ppc-is-down"}
        />
      )}
      <Stat label={isFlow ? "Avg per day" : "Avg level"} value={fmt(total / len)} />
      <Stat label="Peak day" value={`${fmt(points[peak][metric])} on ${dShort(points, peak)}`} />
      {pct !== null && <Stat label={`vs prior ${len} days`} value={`${pct >= 0 ? "+" : "−"}${Math.round(Math.abs(pct) * 100)}%`} cls={pct >= 0 ? "ppc-is-up" : "ppc-is-down"} />}
      <Stat label="Annotations" value={parts.length ? parts.join(" · ") : "None"} cls={parts.length ? "" : "is-none"} />
      <div className="ppc-actions">
        <button type="button" className="ppc-btn-accent" onClick={onZoom}>
          Zoom to period
        </button>
        <button type="button" className="ppc-btn-secondary" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="ppc-stat">
      <span className="ppc-eyebrow">{label}</span>
      <span className={`ppc-stat-val ${cls ?? ""}`}>{value}</span>
    </div>
  );
}

// ---------- Fixed key ----------
function KeyFooter() {
  return (
    <footer className="ppc-key">
      <span className="ppc-eyebrow">Key</span>
      <div className="ppc-key-grid">
        <div className="ppc-key-item">
          <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
            <rect x={1} y={1} width={16} height={16} rx={2} fill="rgba(127,176,214,.16)" />
            <circle cx={9} cy={9} r={4} fill="var(--bg)" stroke="var(--ev)" strokeWidth={1.8} />
          </svg>
          <span>
            <span className="ppc-key-name" style={{ color: "var(--evText)" }}>
              Event
            </span>
            <span className="ppc-key-desc">Shaded period of a named event, marked at its start and end</span>
          </span>
        </div>
        <div className="ppc-key-item">
          <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
            <circle cx={9} cy={9} r={4.5} fill="var(--up)" />
          </svg>
          <span>
            <span className="ppc-key-name" style={{ color: "var(--up)" }}>
              Update
            </span>
            <span className="ppc-key-desc">Notable move within a day of a game update</span>
          </span>
        </div>
        <div className="ppc-key-item">
          <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
            <rect x={5} y={5} width={8} height={8} rx={2} fill="var(--rel)" />
          </svg>
          <span>
            <span className="ppc-key-name" style={{ color: "var(--rel)" }}>
              Release
            </span>
            <span className="ppc-key-desc">The plugin itself was updated. Shown in the timeline lane</span>
          </span>
        </div>
        <div className="ppc-key-item">
          <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true">
            <path d="M9 4L14 9L9 14L4 9Z" fill="var(--bg)" stroke="var(--goldHi)" strokeWidth={1.6} />
          </svg>
          <span>
            <span className="ppc-key-name" style={{ color: "var(--goldHi)" }}>
              Milestone
            </span>
            <span className="ppc-key-desc">Total downloads passed a round number</span>
          </span>
        </div>
        <div className="ppc-key-item ppc-key-item--warn">
          <WarningIcon />
          <span className="ppc-key-desc">
            Markers show date overlap only. A marked day lined up with an event, update or release; it does not prove that caused the change.
          </span>
        </div>
      </div>
    </footer>
  );
}

// ---------- Icons ----------
function CalIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 14 14" aria-hidden="true">
      <rect x={1.5} y={2.5} width={11} height={10} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.3} />
      <path d="M1.5 6H12.5M4.5 1V4M9.5 1V4" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  );
}
function ZoomOutIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx={6} cy={6} r={4.3} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <path d="M9.2 9.2L12.5 12.5M4 6H8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}
function ZoomInIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx={6} cy={6} r={4.3} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <path d="M9.2 9.2L12.5 12.5M4 6H8M6 4V8" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}
function WarningIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 1.3L13 11.8H1L7 1.3Z" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M7 5.3V8.3" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={7} cy={10.1} r={0.75} fill="currentColor" />
    </svg>
  );
}

// ---------- Export ----------
function exportTrend(points: PluginTrendPoint[], win: Win, ann: (i: number) => Annotation, pluginName: string, kind: "csv" | "json") {
  const { a: lo, b: hi } = win;
  const rows = [];
  for (let i = lo; i <= hi; i++) {
    const an = ann(i);
    const o = an.prim ? (an.prim.cat === "event" ? an.prim.event : an.prim.update) : null;
    rows.push({
      date: points[i].capturedAt.slice(0, 10),
      downloads_total: points[i].downloadsTotal,
      downloads_today: points[i].downloadsToday,
      subscribers_total: points[i].subscribersTotal,
      annotation: an.prim?.cat ?? "",
      title: o?.title ?? "",
      url: o?.url ?? "",
      release: an.release,
      milestone: an.milestone ?? "",
    });
  }
  const text =
    kind === "csv"
      ? [
          "date,downloads_total,downloads_today,subscribers_total,annotation,title,url,release,milestone",
          ...rows.map((r) =>
            [r.date, r.downloads_total, r.downloads_today, r.subscribers_total, r.annotation, `"${r.title.replace(/"/g, '""')}"`, r.url, r.release, r.milestone].join(","),
          ),
        ].join("\n")
      : JSON.stringify(rows, null, 2);
  const slug = pluginName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const blob = new Blob([text], { type: kind === "csv" ? "text/csv" : "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}-trend-${rows[0]?.date ?? ""}_${rows[rows.length - 1]?.date ?? ""}.${kind}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
