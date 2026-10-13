import { useMemo, useState, type RefObject } from "react";
import type { PluginTrendPoint } from "../api";
import { annotate, type AnnotationLayers, type ResolvedEvent, type ResolvedUpdate } from "../lib/trendAnnotations";
import type { TrendMetric } from "./TrendChart";

const FMO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WDAY_HEAD = ["S", "M", "T", "W", "T", "F", "S"];

interface Props {
  points: PluginTrendPoint[];
  metric: TrendMetric;
  events: ResolvedEvent[];
  updates: ResolvedUpdate[];
  notable: boolean[];
  releaseSet: Set<number>;
  milestoneMap: Map<number, number>;
  layers: AnnotationLayers;
  currentRange: { a: number; b: number } | null;
  anchorRef: RefObject<HTMLDivElement | null>;
  onApply: (a: number, b: number) => void;
  onCancel: () => void;
}

interface Month {
  label: string;
  first: number; // index of day 1 of this month
  days: number; // days in month
  lead: number; // weekday (0-6) of day 1
}

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
function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function CustomRangeCalendar({ points, metric, events, updates, notable, releaseSet, milestoneMap, layers, currentRange, anchorRef, onApply, onCancel }: Props) {
  const lastIndex = points.length - 1;

  const months = useMemo((): Month[] => {
    const first = dayDate(points, 0);
    const out: Month[] = [];
    for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); ; m++) {
      if (m > 11) {
        m = 0;
        y++;
      }
      const monthStart = Date.UTC(y, m, 1);
      const firstIndex = Math.round((monthStart - Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate())) / 86400000);
      if (firstIndex > lastIndex) break;
      out.push({
        label: `${FMO[m]} ${y}`,
        first: firstIndex,
        days: new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
        lead: new Date(monthStart).getUTCDay(),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, lastIndex]);

  const monthOf = (i: number) => Math.max(0, months.findIndex((mo) => i >= mo.first && i < mo.first + mo.days));

  const [{ two, width, left }] = useState(() => {
    const vw = window.innerWidth;
    const isTwo = vw >= 700;
    const popW = isTwo ? 600 : Math.min(320, vw - 24);
    let l = 0;
    const anchor = anchorRef.current;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      const L = Math.max(12, Math.min(vw - 12 - popW, r.right - popW));
      l = L - r.left;
    }
    return { two: isTwo, width: popW, left: l };
  });
  const [monthIndex, setMonthIndex] = useState(() => {
    const em = monthOf(currentRange ? currentRange.b : lastIndex);
    return Math.max(0, Math.min(months.length - (two ? 2 : 1), em - (two ? 1 : 0)));
  });
  const [calA, setCalA] = useState<number | null>(currentRange ? currentRange.a : null);
  const [calB, setCalB] = useState<number | null>(currentRange ? currentRange.b : null);
  const [calHover, setCalHover] = useState<number | null>(null);

  const maxMonth = Math.max(0, months.length - (two ? 2 : 1));
  const pa = calA;
  const pb = calB ?? (pa != null && calHover != null && calHover > pa ? calHover : null);

  function ann(i: number) {
    return annotate(i, events, updates, notable, releaseSet, milestoneMap, layers);
  }

  function dots(i: number) {
    const a = ann(i);
    const out: string[] = [];
    if (a.prim?.cat === "event" && a.prim.bound) out.push("ev");
    if (a.prim?.cat === "update") out.push("up");
    if (a.release) out.push("rel");
    if (a.milestone !== undefined) out.push("ms");
    return out;
  }

  function pick(i: number) {
    if (calA == null || calB != null || i < calA) {
      setCalA(i);
      setCalB(null);
      setCalHover(i);
    } else {
      setCalB(i);
      setCalHover(i);
    }
  }
  function apply() {
    if (calA == null || calB == null) return;
    let a = calA,
      b = calB;
    if (b === a) {
      if (b < lastIndex) b++;
      else a--;
    }
    onApply(a, b);
  }

  const ok = calA != null && calB != null;
  const selText =
    pa == null ? "Pick a start day" : calB == null ? `From ${dShort(points, pa)} · pick an end day` : `${dShort(points, pa)} – ${dShort(points, calB)} · ${plural(calB - pa + 1, "day")}`;

  let infoHead = "Hover a day to see what happened";
  const infoItems: { dot: string; label: string; color: string; text: string }[] = [];
  if (calHover != null) {
    infoHead = `${dLong(points, calHover)} · ${fmt(points[calHover][metric])} downloads`;
    const a = ann(calHover);
    if (a.prim?.cat === "event" && a.prim.event) {
      const suffix = a.prim.bound === "start" ? " (began)" : a.prim.bound === "end" ? " (ended)" : a.prim.bound === "ongoing" ? " (ongoing)" : "";
      infoItems.push({ dot: "band", label: "Event", color: "var(--evText)", text: a.prim.event.title + suffix });
    }
    if (a.prim?.cat === "update" && a.prim.update) infoItems.push({ dot: "up", label: "Update", color: "var(--up)", text: a.prim.update.title });
    if (a.release) infoItems.push({ dot: "rel", label: "Release", color: "var(--rel)", text: "Plugin updated" });
    if (a.milestone !== undefined) infoItems.push({ dot: "ms", label: "Milestone", color: "var(--goldHi)", text: `Passed ${fmt(a.milestone)}` });
  }

  const visibleMonths = months.slice(monthIndex, monthIndex + (two ? 2 : 1));

  return (
    <div className="ppc-pop" role="dialog" aria-label="Custom range" style={{ left, width }}>
      <div className="ppc-cal-head">
        <div className="ppc-cal-head-txt">
          <span className="ppc-eyebrow">Custom range</span>
          <span className="ppc-cal-span">
            {dShort(points, 0)}, {dayDate(points, 0).getUTCFullYear()} (first release) – {dShort(points, lastIndex)}, {dayDate(points, lastIndex).getUTCFullYear()}
          </span>
        </div>
        <div className="ppc-seg">
          <button type="button" className="ppc-icon" aria-label="Previous month" disabled={monthIndex <= 0} onClick={() => setMonthIndex((m) => Math.max(0, m - 1))}>
            <PrevIcon />
          </button>
          <button type="button" className="ppc-icon" aria-label="Next month" disabled={monthIndex >= maxMonth} onClick={() => setMonthIndex((m) => Math.min(maxMonth, m + 1))}>
            <NextIcon />
          </button>
        </div>
      </div>

      <div className="ppc-cal-months">
        {visibleMonths.map((mo, mk) => (
          <div className="ppc-month" key={mk}>
            <span className="ppc-month-label">{mo.label}</span>
            <div className="ppc-grid">
              {WDAY_HEAD.map((w, wi) => (
                <span className="ppc-wd" key={wi}>
                  {w}
                </span>
              ))}
              {Array.from({ length: mo.lead }, (_, k) => (
                <span className="ppc-day is-blank" key={`lead-${k}`} />
              ))}
              {Array.from({ length: mo.days }, (_, d) => {
                const day = d + 1;
                const i = mo.first + day - 1;
                const enabled = i >= 0 && i <= lastIndex;
                if (!enabled) {
                  return (
                    <button type="button" className="ppc-day" disabled key={day}>
                      <span>{day}</span>
                      <span className="ppc-dots" />
                    </button>
                  );
                }
                const classes: string[] = [];
                if (layers.ev && events.some((e) => i >= e.a && i <= e.b)) classes.push("is-event");
                if (i === lastIndex) classes.push("is-today");
                if (i === pa || i === pb) classes.push("is-end");
                else if (pa != null && pb != null && i > pa && i < pb) classes.push("is-range");
                else if (i === calHover) classes.push("is-hover");
                return (
                  <button
                    type="button"
                    className={`ppc-day ${classes.join(" ")}`}
                    key={day}
                    aria-label={dLong(points, i)}
                    onPointerEnter={() => setCalHover(i)}
                    onClick={() => pick(i)}
                  >
                    <span>{day}</span>
                    <span className="ppc-dots">
                      {dots(i).map((t, ti) => (
                        <span className={`ppc-dot ppc-dot--${t}`} key={ti} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="ppc-cal-info" onPointerLeave={() => setCalHover(null)}>
        <span className="ppc-cal-info-head">{infoHead}</span>
        <div className="ppc-cal-items">
          {calHover != null && infoItems.length === 0 && <span className="ppc-cal-item">Nothing marked this day</span>}
          {infoItems.map((it, k) => (
            <span className="ppc-cal-item" key={k}>
              <span className={`ppc-dot ppc-dot--${it.dot}`} />
              <b style={{ color: it.color }}>{it.label}</b>
              {it.text}
            </span>
          ))}
        </div>
      </div>

      <div className="ppc-cal-foot">
        <span className="ppc-cal-sel">{selText}</span>
        <div className="ppc-actions">
          <button type="button" className="ppc-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="ppc-btn-primary" disabled={!ok} onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function PrevIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M8.5 3L4.5 7L8.5 11" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M5.5 3L9.5 7L5.5 11" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
