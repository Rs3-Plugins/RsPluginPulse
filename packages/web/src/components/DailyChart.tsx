import { useEffect, useMemo, useRef, useState } from "react";
import type { ResolvedEvent } from "../lib/trendAnnotations";

const WIDTH = 880;
const PADDING = { top: 16, right: 16, bottom: 30, left: 56 };
const Y_TICK_COUNT = 5;
const X_TICK_COUNT = 7;
const LANE_H = 16;
const MIN_WINDOW = 4; // smallest zoomed-in span, as a b-a index distance (5 days inclusive)
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface DailyLineSeries {
  id: string | number;
  color: string;
  values: number[];
  width?: number;
}

export interface Win {
  a: number;
  b: number;
}

interface Props {
  dates: string[];
  bars?: number[];
  lines: DailyLineSeries[];
  zeroBased: boolean;
  focusId?: string | number | null;
  height?: number;
  renderTooltip: (index: number, date: string) => React.ReactNode;
  // Opt-in only (the Compare chart passes these; the site-overview chart does not,
  // so it keeps its original fixed-scale, non-interactive rendering untouched).
  interactive?: boolean;
  events?: ResolvedEvent[];
  showEvents?: boolean;
  // Day indices where any compared item had a release -- split the same way
  // the single-plugin trend chart tags them: releaseDays is each item's
  // very first recorded release ("Release"), updateDays is every one after
  // that ("Update"). Plain day indices rather than ResolvedRelease-shaped
  // objects since this isn't tied to a single named thing (multiple
  // compared items can each release on the same day).
  releaseDays?: number[];
  updateDays?: number[];
  showReleases?: boolean;
  // Zoom is controlled by the parent (matching TrendChart, whose zoom buttons live in its
  // own header row, not floating over the plot) -- required whenever interactive is true.
  zoom?: Win | null;
  onZoomChange?: (zoom: Win | null) => void;
}

export function DailyChart({
  dates,
  bars,
  lines,
  zeroBased,
  focusId = null,
  height = 280,
  renderTooltip,
  interactive = false,
  events = [],
  showEvents = true,
  releaseDays = [],
  updateDays = [],
  showReleases = true,
  zoom = null,
  onZoomChange,
}: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<Win | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(WIDTH);

  const nAll = dates.length;
  const lastAll = Math.max(0, nAll - 1);
  const setZoom = (z: Win | null) => onZoomChange?.(z);

  useEffect(() => {
    if (!interactive) return;
    const el = wrapRef.current;
    if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w) setMeasuredWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [interactive]);

  const W = interactive ? Math.max(300, measuredWidth) : WIDTH;
  const { a: lo, b: hi } = zoom ?? { a: 0, b: lastAll };
  const n = hi - lo + 1;
  const hasLane =
    interactive && ((showEvents && events.length > 0) || (showReleases && (releaseDays.length > 0 || updateDays.length > 0)));
  const releaseDaySet = useMemo(() => new Set(releaseDays), [releaseDays]);
  const updateDaySet = useMemo(() => new Set(updateDays), [updateDays]);
  const LANE_GAP = 6; // gap between the plot baseline and the lane, matching TrendChart
  const laneExtra = hasLane ? LANE_H + LANE_GAP : 0;
  const plotWidth = W - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom - laneExtra;

  const { yTicks, xForIndex, yForValue } = useMemo(() => {
    const allValues: number[] = [];
    for (let i = lo; i <= hi; i++) {
      if (bars) allValues.push(bars[i]);
      for (const l of lines) allValues.push(l.values[i]);
    }
    const rawMin = zeroBased ? 0 : allValues.length ? Math.min(...allValues) : 0;
    const rawMax = allValues.length ? Math.max(...allValues, rawMin + 1) : 1;
    const { min, max, ticks } = niceTicks(rawMin, rawMax, Y_TICK_COUNT);
    const xForIndex = (i: number) => (n <= 1 ? 0 : ((i - lo) / (n - 1)) * plotWidth);
    const yForValue = (v: number) => plotHeight - ((v - min) / (max - min || 1)) * plotHeight;
    return { yTicks: ticks, xForIndex, yForValue };
  }, [bars, lines, zeroBased, lo, hi, n, plotWidth, plotHeight]);

  const xTickIndices = useMemo(() => pickTickIndices(dates, lo, hi, X_TICK_COUNT), [dates, lo, hi]);
  const barWidth = bars ? Math.max(1, (plotWidth / Math.max(n, 1)) * (n > 120 ? 0.75 : 0.62)) : 0;

  // ---------- Timeline lane fill: Event and Release/Update are two independent
  // layers, not one mutually-exclusive classification -- a release that happens to
  // land inside an ongoing event's date range still gets its own tint painted on top
  // (with transparency), rather than the event silently hiding it. No per-series
  // notability here -- these are plain calendar facts shared across every compared item. ----------
  const eventFillSegs = useMemo(() => {
    if (!hasLane) return [];
    const dayHalf = n > 1 ? plotWidth / (n - 1) / 2 : plotWidth / 2;
    const segs: { x1: number; x2: number; cls: "ev" }[] = [];
    let curCls: "ev" | null = null;
    let curStart = lo;
    const push = (endIndex: number) => {
      if (!curCls) return;
      const x1 = Math.max(0, xForIndex(curStart) - dayHalf);
      const x2 = Math.min(plotWidth, xForIndex(endIndex) + dayHalf);
      if (x2 > x1) segs.push({ x1, x2, cls: curCls });
    };
    for (let i = lo; i <= hi; i++) {
      const cls: "ev" | null = showEvents && events.some((e) => i >= e.a && i <= e.b) ? "ev" : null;
      if (cls !== curCls) {
        push(i - 1);
        curCls = cls;
        curStart = i;
      }
    }
    push(hi);
    return segs;
  }, [hasLane, lo, hi, n, plotWidth, xForIndex, events, showEvents]);

  const releaseFillSegs = useMemo(() => {
    if (!hasLane) return [];
    const dayHalf = n > 1 ? plotWidth / (n - 1) / 2 : plotWidth / 2;
    const segs: { x1: number; x2: number; cls: "rel" | "relupdate" }[] = [];
    let curCls: "rel" | "relupdate" | null = null;
    let curStart = lo;
    const push = (endIndex: number) => {
      if (!curCls) return;
      const x1 = Math.max(0, xForIndex(curStart) - dayHalf);
      const x2 = Math.min(plotWidth, xForIndex(endIndex) + dayHalf);
      if (x2 > x1) segs.push({ x1, x2, cls: curCls });
    };
    for (let i = lo; i <= hi; i++) {
      const isRelease = showReleases && releaseDaySet.has(i);
      const isUpdate = !isRelease && showReleases && updateDaySet.has(i);
      const cls: "rel" | "relupdate" | null = isRelease ? "rel" : isUpdate ? "relupdate" : null;
      if (cls !== curCls) {
        push(i - 1);
        curCls = cls;
        curStart = i;
      }
    }
    push(hi);
    return segs;
  }, [hasLane, lo, hi, n, plotWidth, xForIndex, releaseDaySet, updateDaySet, showReleases]);

  const visibleEvents = useMemo(() => (showEvents ? events.filter((e) => e.b >= lo && e.a <= hi) : []), [events, showEvents, lo, hi]);
  const visibleReleaseDays = useMemo(
    () => (showReleases ? releaseDays.filter((d) => d >= lo && d <= hi) : []),
    [releaseDays, showReleases, lo, hi],
  );
  const visibleUpdateDays = useMemo(
    () => (showReleases ? updateDays.filter((d) => d >= lo && d <= hi) : []),
    [updateDays, showReleases, lo, hi],
  );

  function setWin(a: number, w: number) {
    w = Math.round(Math.max(MIN_WINDOW, Math.min(lastAll, w)));
    if (w >= lastAll) {
      setZoom(null);
      return;
    }
    a = Math.max(0, Math.min(lastAll - w, Math.round(a)));
    if (!zoom || zoom.a !== a || zoom.b !== a + w) setZoom({ a, b: a + w });
  }
  function zoomBy(factor: number, center: number) {
    const w = hi - lo;
    const nw = Math.max(MIN_WINDOW, Math.min(lastAll, Math.round(w * factor)));
    if (nw === w) return;
    setWin(center - ((center - lo) * nw) / w, nw);
  }

  // ---------- Pointer / wheel (native listeners -- wheel needs { passive: false }, which
  // React's onWheel can't guarantee) ----------
  useEffect(() => {
    if (!interactive) return;
    const el = wrapRef.current;
    if (!el) return;

    let drag: { x: number; a: number; w: number; mode: "pan" | "zoom" | null; si: number; pa: number; pb: number } | null = null;
    let justDragged = false;

    function idxAt(clientX: number): number {
      const r = el!.getBoundingClientRect();
      const x = clientX - r.left - PADDING.left;
      return Math.max(lo, Math.min(hi, lo + (x / plotWidth) * (n - 1)));
    }
    function onDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const si = Math.round(idxAt(e.clientX));
      drag = { x: e.clientX, a: lo, w: hi - lo, mode: null, si, pa: si, pb: si };
    }
    function onMove(e: PointerEvent) {
      if (drag) {
        const dx = e.clientX - drag.x;
        if (!drag.mode && Math.abs(dx) > 4) {
          drag.mode = e.shiftKey ? "pan" : "zoom";
          try {
            el!.setPointerCapture(e.pointerId);
          } catch {
            /* no-op */
          }
          setDragActive(true);
          setHoverIndex(null);
        }
        if (drag.mode === "pan") {
          setWin(drag.a - (dx / plotWidth) * (n - 1), drag.w);
          return;
        }
        if (drag.mode === "zoom") {
          const c = Math.round(idxAt(e.clientX));
          drag.pa = Math.min(drag.si, c);
          drag.pb = Math.max(drag.si, c);
          setHoverIndex(null);
          setDragPreview({ a: drag.pa, b: drag.pb });
          return;
        }
      }
      const r = el!.getBoundingClientRect();
      const x = e.clientX - r.left - PADDING.left;
      if (x >= -6 && x <= plotWidth + 6) setHoverIndex(Math.max(lo, Math.min(hi, lo + Math.round((x / plotWidth) * (n - 1)))));
      else setHoverIndex(null);
    }
    function endDrag() {
      const d = drag;
      drag = null;
      setDragActive(false);
      setDragPreview(null);
      if (d && d.mode === "zoom" && d.pb - d.pa >= 1) {
        setWin(d.pa, d.pb - d.pa);
        justDragged = true;
        setTimeout(() => {
          justDragged = false;
        }, 0);
      }
    }
    function onDoubleClick() {
      if (justDragged) return;
      setZoom(null);
    }
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomBy(e.deltaY > 0 ? 1.2 : 1 / 1.2, idxAt(e.clientX));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && hi - lo < lastAll) {
        e.preventDefault();
        setWin(lo + (e.deltaX / plotWidth) * (n - 1), hi - lo);
      }
    }
    function onLeave() {
      if (!drag) setHoverIndex(null);
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("dblclick", onDoubleClick);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("dblclick", onDoubleClick);
      el.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, lo, hi, n, plotWidth, lastAll]);

  if (n <= 0) return <p>No data in this range.</p>;

  const hoverX = hoverIndex !== null ? xForIndex(hoverIndex) : null;
  const preview = dragPreview;

  return (
    <div ref={wrapRef} className={interactive ? "daily-chart-wrap" : undefined} style={{ position: "relative", cursor: interactive ? (dragActive ? "grabbing" : "crosshair") : undefined }}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width={interactive ? W : "100%"}
        height={height}
        role="img"
        aria-label="Daily downloads chart"
        style={{ overflow: "visible", fontFamily: "system-ui, sans-serif", display: "block" }}
      >
        <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
          {visibleEvents.map((e, k) => {
            const x1 = e.a < lo ? 0 : xForIndex(e.a);
            const x2 = e.b > hi ? plotWidth : xForIndex(e.b);
            return (
              <g key={`ev-${k}`}>
                <rect className="ppc-s-band" x={x1} y={0} width={Math.max(2, x2 - x1)} height={plotHeight} />
                <rect className="ppc-s-bandtop" x={x1} y={0} width={Math.max(2, x2 - x1)} height={2} />
                {e.a >= lo && <line className="ppc-s-bound" x1={xForIndex(e.a)} x2={xForIndex(e.a)} y1={0} y2={plotHeight} />}
                {e.b <= hi && <line className={`ppc-s-bound${e.open ? " is-open" : ""}`} x1={xForIndex(e.b)} x2={xForIndex(e.b)} y1={0} y2={plotHeight} />}
              </g>
            );
          })}
          {visibleReleaseDays.map((d, k) => (
            <line key={`rel-${k}`} className="ppc-s-releaseline" x1={xForIndex(d)} x2={xForIndex(d)} y1={0} y2={plotHeight} />
          ))}
          {visibleUpdateDays.map((d, k) => (
            <line key={`upd-${k}`} className="ppc-s-relupdateline" x1={xForIndex(d)} x2={xForIndex(d)} y1={0} y2={plotHeight} />
          ))}

          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={0} x2={plotWidth} y1={yForValue(tick)} y2={yForValue(tick)} stroke="var(--grid)" strokeWidth={1} />
              <text x={-8} y={yForValue(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--dim)">
                {compactNumber(tick)}
              </text>
            </g>
          ))}

          <line x1={0} x2={plotWidth} y1={plotHeight} y2={plotHeight} stroke="var(--line2)" strokeWidth={1} />

          {xTickIndices.map((i) => (
            <text key={i} x={xForIndex(i)} y={plotHeight + laneExtra + 20} textAnchor="middle" fontSize={11} fill="var(--dim)">
              {formatAxisLabel(dates[i], n)}
            </text>
          ))}

          {bars &&
            Array.from({ length: n }, (_, k) => lo + k).map((i) => (
              <rect
                key={i}
                x={xForIndex(i) - barWidth / 2}
                y={yForValue(bars[i])}
                width={barWidth}
                height={Math.max(0, plotHeight - yForValue(bars[i]))}
                rx={1}
                fill="var(--gold)"
                opacity={hoverIndex === null ? 0.38 : hoverIndex === i ? 0.95 : 0.2}
              />
            ))}

          {lines.map((l) => {
            const dimmed = focusId != null && focusId !== l.id;
            const d = Array.from({ length: n }, (_, k) => lo + k)
              .map((i, k) => `${k === 0 ? "M" : "L"} ${xForIndex(i).toFixed(1)} ${yForValue(l.values[i]).toFixed(1)}`)
              .join(" ");
            return (
              <path
                key={l.id}
                d={d}
                fill="none"
                stroke={l.color}
                strokeWidth={focusId === l.id ? 3 : (l.width ?? 2)}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={dimmed ? 0.22 : 1}
                style={{ transition: "opacity 0.15s" }}
              />
            );
          })}

          {lines.map((l) => {
            const dimmed = focusId != null && focusId !== l.id;
            const last = l.values[hi];
            return <circle key={l.id} cx={xForIndex(hi)} cy={yForValue(last)} r={3.5} fill={l.color} opacity={dimmed ? 0.22 : 1} />;
          })}

          {hoverX !== null && <line x1={hoverX} x2={hoverX} y1={0} y2={plotHeight} stroke="var(--goldHi)" strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />}

          {hoverX !== null &&
            lines.map((l) => <circle key={l.id} cx={hoverX} cy={yForValue(l.values[hoverIndex!])} r={4.5} fill="var(--bg)" stroke={l.color} strokeWidth={2} />)}

          {preview && (
            <>
              <rect
                className="daily-zoom-preview"
                x={xForIndex(preview.a)}
                y={0}
                width={Math.max(1, xForIndex(preview.b) - xForIndex(preview.a))}
                height={plotHeight}
              />
              <line className="daily-zoom-edge" x1={xForIndex(preview.a)} x2={xForIndex(preview.a)} y1={0} y2={plotHeight} />
              <line className="daily-zoom-edge" x1={xForIndex(preview.b)} x2={xForIndex(preview.b)} y1={0} y2={plotHeight} />
            </>
          )}

          {hasLane && (
            <>
              <rect className="ppc-s-lane" x={0} y={plotHeight + laneExtra - LANE_H} width={plotWidth} height={LANE_H} rx={3} />
              {eventFillSegs.map((s, k) => (
                <rect key={`ef-${k}`} className={`ppc-lanefill ppc-lanefill--${s.cls}`} x={s.x1} y={plotHeight + laneExtra - LANE_H} width={s.x2 - s.x1} height={LANE_H} />
              ))}
              {releaseFillSegs.map((s, k) => (
                <rect key={`rf-${k}`} className={`ppc-lanefill ppc-lanefill--${s.cls}`} x={s.x1} y={plotHeight + laneExtra - LANE_H} width={s.x2 - s.x1} height={LANE_H} />
              ))}
            </>
          )}

          {!interactive && (
            <rect x={0} y={0} width={plotWidth} height={plotHeight} fill="transparent" onPointerMove={handleMoveStatic} onPointerLeave={() => setHoverIndex(null)} />
          )}
        </g>
      </svg>

      {hasLane && (
        <div className="ppc-lane-label" style={{ top: PADDING.top + plotHeight + LANE_GAP + 3, width: PADDING.left - 8 }}>
          Timeline
        </div>
      )}

      {hoverIndex !== null && (
        <foreignObject x={0} y={0} width={W} height={1} style={{ overflow: "visible" }}>
          <div
            style={{
              position: "absolute",
              left: PADDING.left + (hoverX ?? 0) > W - 220 ? undefined : PADDING.left + (hoverX ?? 0) + 14,
              right: PADDING.left + (hoverX ?? 0) > W - 220 ? W - PADDING.left - (hoverX ?? 0) + 14 : undefined,
              top: PADDING.top + 4,
              background: "var(--raise)",
              border: "1px solid var(--line2)",
              borderRadius: 6,
              padding: "8px 12px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "var(--shadow)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              zIndex: 2,
            }}
          >
            {renderTooltip(hoverIndex, dates[hoverIndex])}
          </div>
        </foreignObject>
      )}
    </div>
  );

  // Only used by the non-interactive (Overview) path, which keeps its original
  // percent-scaled hover math untouched.
  function handleMoveStatic(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const nearest = n <= 1 ? 0 : Math.round((x / plotWidth) * (n - 1));
    setHoverIndex(Math.min(Math.max(nearest, 0), n - 1));
  }
}

function niceTicks(min: number, max: number, tickCount: number): { min: number; max: number; ticks: number[] } {
  if (min === max) max = min + 1;
  const rawStep = (max - min) / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceNormalized * magnitude;
  const niceMin = Math.max(0, Math.floor(min / step)) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step) ticks.push(Math.round(t));
  return { min: niceMin, max: niceMax, ticks };
}

function pickTickIndices(dates: string[], lo: number, hi: number, desired: number): number[] {
  const n = hi - lo + 1;
  if (n <= 1) return [lo];
  if (n > 120) {
    const monthStarts: number[] = [];
    for (let i = lo; i <= hi; i++) {
      if (new Date(`${dates[i]}T00:00:00Z`).getUTCDate() === 1) monthStarts.push(i);
    }
    if (monthStarts.length === 0) return [lo];
    const step = Math.max(1, Math.ceil(monthStarts.length / desired));
    return monthStarts.filter((_, k) => k % step === 0);
  }
  const step = Math.max(1, Math.ceil(n / desired));
  const out: number[] = [];
  for (let i = lo; i <= hi; i += step) out.push(i);
  return out;
}

function formatAxisLabel(dateIso: string, totalDays: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (totalDays > 120) {
    return d.getUTCMonth() === 0 ? `Jan ${d.getUTCFullYear()}` : MONTHS[d.getUTCMonth()];
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatTooltipDate(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function compactNumber(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(Math.round(v));
}
