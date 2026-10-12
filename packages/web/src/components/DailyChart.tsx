import { useMemo, useState } from "react";

const WIDTH = 880;
const PADDING = { top: 16, right: 16, bottom: 30, left: 56 };
const Y_TICK_COUNT = 5;
const X_TICK_COUNT = 7;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface DailyLineSeries {
  id: string | number;
  color: string;
  values: number[];
  width?: number;
}

interface Props {
  dates: string[];
  bars?: number[];
  lines: DailyLineSeries[];
  zeroBased: boolean;
  focusId?: string | number | null;
  height?: number;
  renderTooltip: (index: number, date: string) => React.ReactNode;
}

export function DailyChart({ dates, bars, lines, zeroBased, focusId = null, height = 280, renderTooltip }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const n = dates.length;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = height - PADDING.top - PADDING.bottom;

  const { yMin, yMax, yTicks, xForIndex, yForValue, xTickIndices } = useMemo(() => {
    const allValues = [...(bars ?? []), ...lines.flatMap((l) => l.values)];
    const rawMin = zeroBased ? 0 : allValues.length ? Math.min(...allValues) : 0;
    const rawMax = allValues.length ? Math.max(...allValues, rawMin + 1) : 1;
    const { min, max, ticks } = niceTicks(rawMin, rawMax, Y_TICK_COUNT);
    const xForIndex = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * plotWidth);
    const yForValue = (v: number) => plotHeight - ((v - min) / (max - min || 1)) * plotHeight;
    return { yMin: min, yMax: max, yTicks: ticks, xForIndex, yForValue, xTickIndices: pickTickIndices(dates, X_TICK_COUNT) };
  }, [bars, lines, zeroBased, n, plotWidth, plotHeight, dates]);

  const barWidth = bars ? Math.max(1, (plotWidth / Math.max(n, 1)) * (n > 120 ? 0.75 : 0.62)) : 0;

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const nearest = n <= 1 ? 0 : Math.round((x / plotWidth) * (n - 1));
    setHoverIndex(Math.min(Math.max(nearest, 0), n - 1));
  }

  if (n === 0) return <p>No data in this range.</p>;

  const hoverX = hoverIndex !== null ? xForIndex(hoverIndex) : null;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      width="100%"
      role="img"
      aria-label="Daily downloads chart"
      style={{ overflow: "visible", fontFamily: "system-ui, sans-serif" }}
    >
      <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
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
          <text key={i} x={xForIndex(i)} y={plotHeight + 20} textAnchor="middle" fontSize={11} fill="var(--dim)">
            {formatAxisLabel(dates[i], n)}
          </text>
        ))}

        {bars?.map((v, i) => (
          <rect
            key={i}
            x={xForIndex(i) - barWidth / 2}
            y={yForValue(v)}
            width={barWidth}
            height={Math.max(0, plotHeight - yForValue(v))}
            rx={1}
            fill="var(--gold)"
            opacity={hoverIndex === null ? 0.38 : hoverIndex === i ? 0.95 : 0.2}
          />
        ))}

        {lines.map((l) => {
          const dimmed = focusId != null && focusId !== l.id;
          const d = l.values.map((v, i) => `${i === 0 ? "M" : "L"} ${xForIndex(i).toFixed(1)} ${yForValue(v).toFixed(1)}`).join(" ");
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
          const last = l.values[l.values.length - 1];
          return (
            <circle
              key={l.id}
              cx={xForIndex(n - 1)}
              cy={yForValue(last)}
              r={3.5}
              fill={l.color}
              opacity={dimmed ? 0.22 : 1}
            />
          );
        })}

        {hoverX !== null && <line x1={hoverX} x2={hoverX} y1={0} y2={plotHeight} stroke="var(--goldHi)" strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />}

        {hoverX !== null &&
          lines.map((l) => (
            <circle key={l.id} cx={hoverX} cy={yForValue(l.values[hoverIndex!])} r={4.5} fill="var(--bg)" stroke={l.color} strokeWidth={2} />
          ))}

        <rect x={0} y={0} width={plotWidth} height={plotHeight} fill="transparent" onPointerMove={handleMove} onPointerLeave={() => setHoverIndex(null)} />
      </g>

      {hoverIndex !== null && (
        <foreignObject x={0} y={0} width={WIDTH} height={1} style={{ overflow: "visible" }}>
          <div
            style={{
              position: "absolute",
              left: PADDING.left + (hoverX ?? 0) > WIDTH - 220 ? undefined : PADDING.left + (hoverX ?? 0) + 14,
              right: PADDING.left + (hoverX ?? 0) > WIDTH - 220 ? WIDTH - PADDING.left - (hoverX ?? 0) + 14 : undefined,
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
    </svg>
  );
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

function pickTickIndices(dates: string[], desired: number): number[] {
  const n = dates.length;
  if (n <= 1) return [0];
  if (n > 120) {
    const monthStarts: number[] = [];
    for (let i = 0; i < n; i++) {
      if (new Date(`${dates[i]}T00:00:00Z`).getUTCDate() === 1) monthStarts.push(i);
    }
    if (monthStarts.length === 0) return [0];
    const step = Math.max(1, Math.ceil(monthStarts.length / desired));
    return monthStarts.filter((_, k) => k % step === 0);
  }
  const step = Math.max(1, Math.ceil(n / desired));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
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
