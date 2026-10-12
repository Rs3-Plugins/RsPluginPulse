import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPluginTrend, getTopAuthors, getTopPlugins, type Period } from "../api";
import { useGame } from "../context/GameContext";
import { Dropdown } from "./Dropdown";

type HotPeriod = "hot" | "weekly" | "monthly";

const HOT_PERIOD_OPTIONS: { key: HotPeriod; label: string }[] = [
  { key: "hot", label: "Today" },
  { key: "weekly", label: "This week" },
  { key: "monthly", label: "This month" },
];

interface HotItem {
  rank: number;
  id: number;
  name: string;
  sub: string;
  value: number;
  spark: string | null;
}

interface Props {
  title: string;
  kind: "plugins" | "authors";
  onSeeAll: (period: Period) => void;
}

export function HotCard({ title, kind, onSeeAll }: Props) {
  const { game } = useGame();
  const navigate = useNavigate();
  const [hotPeriod, setHotPeriod] = useState<HotPeriod>("weekly");
  const [items, setItems] = useState<HotItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setItems(null);
      if (kind === "plugins") {
        const { plugins } = await getTopPlugins(hotPeriod, game, 5);
        const top = plugins.slice(0, 5);
        const sparks = await Promise.all(top.map((p) => buildPluginSparkline(p.id)));
        if (cancelled) return;
        setItems(
          top.map((p, i) => ({
            rank: i + 1,
            id: p.id,
            name: p.name,
            sub: p.authorName,
            value: p.value,
            spark: sparks[i],
          })),
        );
      } else {
        const { authors } = await getTopAuthors(hotPeriod, game, 5);
        const top = authors.slice(0, 5);
        if (cancelled) return;
        setItems(
          top.map((a, i) => ({
            rank: i + 1,
            id: a.authorId,
            name: a.authorName,
            sub: `${a.pluginCount} plugin${a.pluginCount === 1 ? "" : "s"}`,
            value: a.value,
            spark: null,
          })),
        );
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [kind, hotPeriod, game]);

  return (
    <div className="card">
      <div className="card-edge" />
      <div className="hot-card-head">
        <span className="hot-card-title">
          <span className="hot-dot" />
          {title}
        </span>
        <Dropdown
          value={hotPeriod}
          options={HOT_PERIOD_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          onChange={(v) => setHotPeriod(v as HotPeriod)}
          ariaLabel="Hot period"
        />
      </div>

      {items === null &&
        Array.from({ length: 5 }, (_, i) => (
          <div className="hot-row" key={i}>
            <span className="skeleton-bar" style={{ width: 14, height: 12 }} />
            <span className="hot-name-col">
              <span className="skeleton-bar" style={{ width: "70%" }} />
              <span className="skeleton-bar" style={{ width: "45%" }} />
            </span>
            <span className="skeleton-bar" style={{ width: 56, height: 14 }} />
            <span className="skeleton-bar" style={{ width: 40, justifySelf: "end" }} />
          </div>
        ))}

      {items?.map((item) => (
        <div
          key={item.id}
          className={`hot-row ${item.spark === null ? "no-spark" : ""}`}
          onClick={() => navigate(kind === "plugins" ? `/plugin/${item.id}` : `/author/${item.id}`)}
        >
          <span className="hot-rank">{item.rank}</span>
          <span className="hot-name-col">
            <span className="hot-name">{item.name}</span>
            <span className="hot-sub">{item.sub}</span>
          </span>
          {item.spark !== null && (
            <svg width="56" height="22" viewBox="0 0 56 22" className="hot-spark">
              <path d={item.spark} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}
          <span className="hot-value">{formatHotValue(item.value, hotPeriod)}</span>
        </div>
      ))}

      <button className="hot-foot" onClick={() => onSeeAll(hotPeriod)}>
        All {kind} this {hotPeriod === "hot" ? "day" : hotPeriod === "weekly" ? "week" : "month"} →
      </button>
    </div>
  );
}

function formatHotValue(value: number, period: HotPeriod): string {
  const gain = period === "weekly" || period === "monthly";
  return gain ? `${value >= 0 ? "+" : ""}${value.toLocaleString()}` : value.toLocaleString();
}

async function buildPluginSparkline(pluginId: number): Promise<string | null> {
  try {
    const { trend } = await getPluginTrend(pluginId);
    const points = trend.slice(-14).map((p) => p.downloadsTotal);
    if (points.length < 2) return null;
    return sparklinePath(points, 56, 22);
  } catch {
    return null;
  }
}

function sparklinePath(values: number[], width: number, height: number): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
