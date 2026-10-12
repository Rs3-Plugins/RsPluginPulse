import { useMemo, useState } from "react";
import type { PluginTrendPoint } from "../api";
import type { Game } from "../context/GameContext";

const WIDTH = 880;
const HEIGHT = 280;
const PADDING = { top: 16, right: 100, bottom: 36, left: 56 };
const X_TICK_COUNT = 7;
const Y_TICK_COUNT = 5;

export type TrendMetric = "downloadsTotal" | "downloadsToday" | "subscribersTotal";

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

export type ChartType = "line" | "bar";

interface Props {
  points: PluginTrendPoint[];
  metric: TrendMetric;
  unit: string;
  chartType: ChartType;
}

const BAR_MAX_WIDTH = 24;
const BAR_RADIUS = 4;

export function TrendChart({ points, metric, unit, chartType }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  // Bars and the daily "downloads today" metric always read from zero; a
  // cumulative line (total downloads, subscribers) zooms into its own
  // range so small day-to-day moves are actually visible.
  const zeroBased = chartType === "bar" || metric === "downloadsToday";

  const { xForIndex, yForValue, yTicks, xTickIndices, lineD, areaD, barWidth, slotWidth } = useMemo(() => {
    const values = points.map((p) => p[metric]);
    const rawMin = zeroBased ? 0 : Math.min(...values);
    const rawMax = Math.max(...values, rawMin + 1);
    const { min: domainMin, max: domainMax, ticks: yTicks } = niceTicks(rawMin, rawMax, Y_TICK_COUNT);

    const xForIndex = (i: number) => (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotWidth);
    const yForValue = (v: number) => plotHeight - ((v - domainMin) / (domainMax - domainMin)) * plotHeight;

    const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xForIndex(i)} ${yForValue(p[metric])}`).join(" ");
    const areaD =
      points.length > 0
        ? `${lineD} L ${xForIndex(points.length - 1)} ${plotHeight} L ${xForIndex(0)} ${plotHeight} Z`
        : "";

    const xTickIndices = pickTickIndices(points.length, X_TICK_COUNT);

    const slotWidth = points.length <= 1 ? plotWidth : plotWidth / points.length;
    const barWidth = Math.min(BAR_MAX_WIDTH, slotWidth * 0.6);

    return { xForIndex, yForValue, yTicks, xTickIndices, lineD, areaD, barWidth, slotWidth };
  }, [points, plotWidth, plotHeight, metric, zeroBased]);

  const milestones = useMemo(() => computeMilestones(points, metric), [points, metric]);

  if (points.length === 0) {
    return <p>No snapshots in this range.</p>;
  }

  const spanMs =
    points.length > 1 ? new Date(points[points.length - 1].capturedAt).getTime() - new Date(points[0].capturedAt).getTime() : 0;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const nearest = points.length <= 1 ? 0 : Math.round((x / plotWidth) * (points.length - 1));
    setHoverIndex(Math.min(Math.max(nearest, 0), points.length - 1));
  }

  const last = points[points.length - 1];
  const lastX = xForIndex(points.length - 1);
  const lastY = yForValue(last[metric]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={`${unit} over time`}
      style={{ overflow: "visible", fontFamily: "system-ui, sans-serif" }}
    >
      <defs>
        <linearGradient id="ppArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--series-1)" stopOpacity={0.26} />
          <stop offset="1" stopColor="var(--series-1)" stopOpacity={0} />
        </linearGradient>
      </defs>

      <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={0} x2={plotWidth} y1={yForValue(tick)} y2={yForValue(tick)} stroke="var(--gridline)" strokeWidth={1} />
            <text x={-8} y={yForValue(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--dim)">
              {tick.toLocaleString()}
            </text>
          </g>
        ))}

        <line x1={0} x2={plotWidth} y1={plotHeight} y2={plotHeight} stroke="var(--baseline)" strokeWidth={1} />

        {xTickIndices.map((i) =>
          hoverIndex === i ? null : (
            <text key={i} x={xForIndex(i)} y={plotHeight + 20} textAnchor="middle" fontSize={11} fill="var(--dim)">
              {formatAxisDate(points[i].capturedAt, spanMs)}
            </text>
          ),
        )}

        {hovered && hoverIndex !== null && (
          <text x={xForIndex(hoverIndex)} y={plotHeight + 20} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--goldHi)">
            {formatAxisDate(hovered.capturedAt, spanMs)}
          </text>
        )}

        {chartType === "bar" ? (
          <>
            {points.map((p, i) => (
              <path
                key={i}
                d={topRoundedRectPath(xForIndex(i) - barWidth / 2, yForValue(p[metric]), barWidth, plotHeight - yForValue(p[metric]), BAR_RADIUS)}
                fill="var(--series-1)"
                opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.75}
              />
            ))}
            <text x={lastX} y={lastY - 8} textAnchor="middle" fontSize={12} fill="var(--text-primary)">
              {last[metric].toLocaleString()}
            </text>
          </>
        ) : (
          <>
            <path d={areaD} fill="url(#ppArea)" />
            <path d={lineD} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lastX} cy={lastY} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />

            {milestones.map((m) => (
              <g key={m.threshold} transform={`translate(${xForIndex(m.index)}, ${yForValue(points[m.index][metric])})`}>
                <circle r={4} fill="var(--surface)" stroke="var(--goldHi)" strokeWidth={2} />
                <text y={-10} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--goldHi)">
                  {formatMilestone(m.threshold)}
                </text>
              </g>
            ))}

            {hovered && hoverIndex !== null && (
              <>
                <line x1={xForIndex(hoverIndex)} x2={xForIndex(hoverIndex)} y1={0} y2={plotHeight} stroke="var(--goldHi)" strokeWidth={1} strokeDasharray="2 3" />
                <circle cx={xForIndex(hoverIndex)} cy={yForValue(hovered[metric])} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
              </>
            )}
          </>
        )}

        {chartType === "bar" ? (
          points.map((_, i) => (
            <rect
              key={i}
              x={xForIndex(i) - slotWidth / 2}
              y={0}
              width={slotWidth}
              height={plotHeight}
              fill="transparent"
              onPointerEnter={() => setHoverIndex(i)}
              onPointerLeave={() => setHoverIndex(null)}
            />
          ))
        ) : (
          <rect
            x={0}
            y={0}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        )}
      </g>

      {chartType === "line" && (
        <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
          <line
            x1={lastX}
            y1={lastY}
            x2={plotWidth + 14}
            y2={lastY}
            stroke="var(--series-1)"
            strokeDasharray="2 3"
            opacity={0.7}
          />
        </g>
      )}

      {chartType === "line" && (
        <foreignObject
          x={PADDING.left + plotWidth + 16}
          y={PADDING.top + lastY - 20}
          width={PADDING.right - 16}
          height={40}
          style={{ overflow: "visible" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", color: "var(--dim)" }}>LATEST</span>
            <span
              style={{
                height: 24,
                boxSizing: "border-box",
                padding: "0 8px",
                display: "inline-flex",
                alignItems: "center",
                width: "fit-content",
                border: "1px solid var(--series-1)",
                borderRadius: 4,
                background: "var(--surface2)",
                color: "var(--series-1)",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {last[metric].toLocaleString()}
            </span>
          </div>
        </foreignObject>
      )}

      {hovered && (
        <foreignObject x={0} y={0} width={WIDTH} height={1} style={{ overflow: "visible" }}>
          <div
            style={{
              position: "absolute",
              left: Math.min(PADDING.left + xForIndex(hoverIndex!) + 12, WIDTH - 180),
              top: 4,
              background: "var(--surface2)",
              border: "1px solid var(--baseline)",
              borderRadius: 6,
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
              padding: "8px 12px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--dim)" }}>{formatTooltipDate(hovered.capturedAt)}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
              {hovered[metric].toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{unit}</div>
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

function topRoundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return `M ${x} ${y + height}
          L ${x} ${y + r}
          Q ${x} ${y} ${x + r} ${y}
          L ${x + width - r} ${y}
          Q ${x + width} ${y} ${x + width} ${y + r}
          L ${x + width} ${y + height}
          Z`;
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

function pickTickIndices(pointCount: number, desiredCount: number): number[] {
  if (pointCount <= 1) return [0];
  const count = Math.min(desiredCount, pointCount);
  const indices = new Set<number>();
  for (let i = 0; i < count; i++) {
    indices.add(Math.round((i / (count - 1)) * (pointCount - 1)));
  }
  return Array.from(indices).sort((a, b) => a - b);
}

const MILESTONE_THRESHOLDS = [100, 500, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];

// Flags the first point where a cumulative metric crosses a round number,
// so "crossed 10k downloads" is visible directly on the line. Daily
// downloads resets every day so milestones don't apply to it.
function computeMilestones(points: PluginTrendPoint[], metric: TrendMetric): { index: number; threshold: number }[] {
  if (metric === "downloadsToday" || points.length === 0) return [];
  const values = points.map((p) => p[metric]);
  const first = values[0];
  const last = values[values.length - 1];
  const crossed = MILESTONE_THRESHOLDS.filter((t) => t > first && t <= last).slice(-5);
  return crossed
    .map((threshold) => ({ threshold, index: values.findIndex((v) => v >= threshold) }))
    .filter((m) => m.index !== -1);
}

function formatMilestone(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}k`;
  return String(n);
}

function formatTooltipDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatAxisDate(iso: string, spanMs: number): string {
  const date = new Date(iso);
  const dayMs = 24 * 60 * 60 * 1000;
  if (spanMs <= 2 * dayMs) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (spanMs <= 365 * dayMs) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString([], { month: "short", year: "numeric" });
}
