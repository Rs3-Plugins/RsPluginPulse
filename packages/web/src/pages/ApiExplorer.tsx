import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { API_BASE, getTopAuthors, getTopPlugins, type AuthorLeaderboardRow, type PluginLeaderboardRow } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dropdown } from "../components/Dropdown";
import { PluginAuthorPicker, type PickerItem } from "../components/PluginAuthorPicker";
import { useGame } from "../context/GameContext";

type ParamType = "enum" | "int" | "string";
type Tab = "body" | "headers" | "curl" | "fetch";
type TokenClass = "key" | "string" | "number" | "bool" | "punct" | "plain";

interface ParamDef {
  name: string;
  type: ParamType;
  options?: string[];
  default?: string;
  placeholder?: string;
  required?: boolean;
  desc: string;
  // When set, this param's value is a plugin/author id -- render a search
  // picker instead of a raw number input. "pickerKindFrom" means the kind
  // (plugin vs author) is read off a sibling param's current value (e.g.
  // the badge endpoint's `key` is a plugin or author id depending on its
  // `type` param) rather than being fixed.
  pickerKind?: "plugin" | "author";
  pickerKindFrom?: string;
}

function resolvePickerKind(param: ParamDef, values: Record<string, string>): "plugin" | "author" | null {
  if (param.pickerKind) return param.pickerKind;
  if (param.pickerKindFrom) return values[param.pickerKindFrom] === "author" ? "author" : "plugin";
  return null;
}

interface EndpointDef {
  key: string;
  path: string;
  title: string;
  desc: string;
  pathParams?: ParamDef[];
  queryParams: ParamDef[];
}

interface ResponseState {
  status: number;
  statusText: string;
  ok: boolean;
  ms: number;
  size: number;
  at: Date;
  url: string;
  headers: Record<string, string>;
  bodyText: string;
  isJson: boolean;
}

interface HistoryEntry {
  epKey: string;
  title: string;
  status: number;
  ok: boolean;
  time: string;
  relUrl: string;
  params: Record<string, string>;
  response: ResponseState;
}

interface Token {
  text: string;
  cls: TokenClass;
}

const PERIOD_OPTIONS = ["alltime", "hot", "weekly", "monthly"];
// osrs isn't ingested yet -- same reasoning as hiding it from the site nav.
const GAME_OPTIONS = ["rs3", "runelite"];
const MAX_LINES = 1200;
const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: "body", label: "Body" },
  { key: "headers", label: "Headers" },
  { key: "curl", label: "cURL" },
  { key: "fetch", label: "fetch" },
];

type DevTab = "api" | "badge" | "embed";

const DEV_TABS: { key: DevTab; label: string }[] = [
  { key: "api", label: "API explorer" },
  { key: "badge", label: "Badge builder" },
  { key: "embed", label: "Embed card" },
];

const DEV_SUBTITLES: Record<DevTab, string> = {
  api: "Pick an endpoint, set its parameters and send a test request. Press Ctrl + Enter to send.",
  badge: "Build a shields.io badge that shows live PluginPulse stats.",
  embed: "Build a stats card for a plugin or author to embed on another site.",
};

function initialDevTab(searchParams: URLSearchParams): DevTab {
  const tab = searchParams.get("tab");
  return tab === "badge" || tab === "embed" ? tab : "api";
}

// Lets a link like /api?tab=badge&type=plugin&id=123 land straight on the
// Badge builder with that plugin already selected, instead of always
// defaulting to the first item in the list.
function initialEntityId(searchParams: URLSearchParams, forTab: DevTab, forType: "plugin" | "author"): number | null {
  if (searchParams.get("tab") !== forTab) return null;
  const type = searchParams.get("type") === "author" ? "author" : "plugin";
  if (type !== forType) return null;
  const id = Number(searchParams.get("id"));
  return Number.isInteger(id) ? id : null;
}

type BadgeType = "plugin" | "author";
type BadgeMetric = "downloads" | "today" | "week" | "month" | "subscribers" | "plugins" | "rank";

const BADGE_STYLES = ["flat", "flat-square", "plastic", "for-the-badge", "social"];
const BADGE_COLORS: { key: string; label: string }[] = [
  { key: "caa44d", label: "Gold" },
  { key: "a6192e", label: "Ember" },
  { key: "1a1a19", label: "Charcoal" },
  { key: "4c1", label: "Green" },
];
const BADGE_LABELS: Record<BadgeMetric, string> = {
  downloads: "downloads",
  today: "downloads today",
  week: "this week",
  month: "this month",
  subscribers: "subscribers",
  rank: "PluginPulse rank",
  plugins: "plugins",
};
const PLUGIN_METRIC_OPTIONS: { value: BadgeMetric; label: string }[] = [
  { value: "downloads", label: "Total downloads" },
  { value: "today", label: "Downloads today" },
  { value: "week", label: "Gained this week" },
  { value: "month", label: "Gained this month" },
  { value: "subscribers", label: "Subscribers" },
  { value: "rank", label: "All-time rank" },
];
const AUTHOR_METRIC_OPTIONS: { value: BadgeMetric; label: string }[] = [
  { value: "downloads", label: "Total downloads" },
  { value: "today", label: "Downloads today" },
  { value: "week", label: "Gained this week" },
  { value: "plugins", label: "Plugin count" },
  { value: "rank", label: "All-time rank" },
];

// showImage has no fixed default here -- plugins default to false, authors
// to true, handled separately wherever this is used.
const EMBED_DEFAULTS = {
  theme: "dark" as const,
  spark: true,
  sparkDays: "30",
  showSubtitle: true,
  showHot: true,
  showStatDownloads: true,
  showStatWeek: true,
  showStatThird: true,
  showFooter: true,
};

function toColorInputValue(hex: string, fallback = "666666"): string {
  const clean = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(clean)) return `#${clean}`;
  if (/^[0-9a-fA-F]{3}$/.test(clean))
    return `#${clean
      .split("")
      .map((c) => c + c)
      .join("")}`;
  return `#${fallback}`;
}

const ENDPOINTS: EndpointDef[] = [
  {
    key: "status",
    path: "/api/status",
    title: "Status",
    desc: "Timestamp of the most recent ingest snapshot — what the header's “updated N min ago” label is built from.",
    queryParams: [{ name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game's ingest to check." }],
  },
  {
    key: "search",
    path: "/api/search",
    title: "Search",
    desc: "Plugins and authors matching a query, ranked by name match quality then total downloads. An empty query returns the top 5 plugins and top 3 authors by weekly gain (\"trending\") — this is what the header search box uses.",
    queryParams: [
      { name: "q", type: "string", placeholder: "e.g. xp", desc: "Search text. Empty returns trending plugins/authors instead." },
      { name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game's catalog to search." },
      { name: "limit", type: "int", default: "6", desc: "Max plugin rows to return (authors scale down proportionally), max 20." },
    ],
  },
  {
    key: "leaderboard-plugins",
    path: "/api/leaderboard/plugins",
    title: "Plugin leaderboard",
    desc: "Top plugins ranked by downloads (or gain) for a period.",
    queryParams: [
      {
        name: "period",
        type: "enum",
        options: PERIOD_OPTIONS,
        default: "alltime",
        desc: "alltime = lifetime downloads, hot = downloads today, weekly/monthly = downloads gained.",
      },
      { name: "limit", type: "int", default: "50", desc: "Rows to return, max 10000." },
      { name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game's catalog to rank." },
    ],
  },
  {
    key: "leaderboard-authors",
    path: "/api/leaderboard/authors",
    title: "Author leaderboard",
    desc: "Top authors, aggregated from their plugins' leaderboard values for a period.",
    queryParams: [
      {
        name: "period",
        type: "enum",
        options: PERIOD_OPTIONS,
        default: "alltime",
        desc: "Same semantics as the plugin leaderboard, summed across each author's plugins.",
      },
      { name: "limit", type: "int", default: "50", desc: "Rows to return, max 10000." },
      { name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game's catalog to rank." },
    ],
  },
  {
    key: "leaderboard-newest",
    path: "/api/leaderboard/newest",
    title: "Newest plugins",
    desc: "Most recently added plugins, newest first.",
    queryParams: [
      { name: "limit", type: "int", default: "50", desc: "Rows to return, max 10000." },
      { name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game's catalog to list." },
    ],
  },
  {
    key: "fastest-growing",
    path: "/api/leaderboard/fastest-growing",
    title: "Fastest growing",
    desc: "Plugins ranked by growth rate (downloads + subscribers) over a time window.",
    queryParams: [
      { name: "limit", type: "int", default: "5", desc: "Rows to return, max 100." },
      { name: "days", type: "int", default: "7", desc: "Window size in days, 1–365." },
      { name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game's catalog to rank." },
    ],
  },
  {
    key: "plugins-random",
    path: "/api/plugins/random",
    title: "Random plugin",
    desc: "A random plugin id — powers the header's Randomizer button.",
    queryParams: [{ name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game to pick from." }],
  },
  {
    key: "plugin-trend",
    path: "/api/plugins/{id}/trend",
    title: "Plugin trend",
    desc: "Plugin metadata plus its full downloads/subscribers snapshot history.",
    pathParams: [{ name: "id", type: "int", required: true, desc: "Plugin id. Search by name below.", pickerKind: "plugin" }],
    queryParams: [],
  },
  {
    key: "author-profile",
    path: "/api/authors/{id}",
    title: "Author profile",
    desc: "Aggregated totals, ranks, and plugin list for an author.",
    pathParams: [{ name: "id", type: "int", required: true, desc: "Author id. Search by name below.", pickerKind: "author" }],
    queryParams: [],
  },
  {
    key: "badge",
    path: "/api/badge/{type}/{key}/{metric}",
    title: "Badge",
    desc: "shields.io endpoint-badge JSON. Point img.shields.io/endpoint?url= at this URL to get a badge that updates itself — this is what the Badge builder tab uses.",
    pathParams: [
      { name: "type", type: "enum", options: ["plugin", "author"], default: "plugin", required: true, desc: "plugin or author." },
      { name: "key", type: "int", required: true, desc: "Plugin or author id, matching type above. Search by name below.", pickerKindFrom: "type" },
      {
        name: "metric",
        type: "enum",
        options: ["downloads", "today", "week", "month", "subscribers", "rank", "plugins"],
        default: "downloads",
        required: true,
        desc: "Value on the badge. subscribers/month are plugin-only, plugins is author-only.",
      },
    ],
    queryParams: [],
  },
  {
    key: "stats",
    path: "/api/stats",
    title: "Site stats (summary)",
    desc: "A small summary: plugin/author counts and lifetime downloads. Use Stats overview below for the full dashboard payload.",
    queryParams: [{ name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game to summarize." }],
  },
  {
    key: "stats-overview",
    path: "/api/stats/overview",
    title: "Stats overview",
    desc: "Everything the Stats page's Overview tab renders: daily download totals, fastest-growing plugins, and newest releases. Categories are a separate paginated endpoint below.",
    queryParams: [
      { name: "range", type: "enum", options: ["30", "90", "365"], default: "90", desc: "Visible window in days for the daily chart." },
      { name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game to summarize." },
    ],
  },
  {
    key: "stats-categories",
    path: "/api/stats/categories",
    title: "Category stats",
    desc: "Tag/category breakdown (plugin count, downloads, weekly gain), paginated -- RuneLite alone has 4000+ distinct tags, so this is never returned as one big list.",
    queryParams: [
      { name: "page", type: "int", default: "1", desc: "1-based page number." },
      { name: "pageSize", type: "int", default: "10", desc: "Rows per page, max 100." },
      { name: "game", type: "enum", options: GAME_OPTIONS, default: "rs3", desc: "Which game's tag cloud to read." },
    ],
  },
  {
    key: "compare",
    path: "/api/compare",
    title: "Compare",
    desc: "Side-by-side series + stats for up to 4 plugins or authors -- powers the Stats page's Compare tab. keys don't need a game param: a plugin/author id already implies its game.",
    queryParams: [
      { name: "type", type: "enum", options: ["plugin", "author"], default: "plugin", required: true, desc: "Comparing plugins or authors." },
      { name: "keys", type: "string", required: true, placeholder: "e.g. 6398181,6412345", desc: "Comma-separated plugin or author ids, up to 4." },
      { name: "metric", type: "enum", options: ["total", "daily", "subs"], default: "total", desc: "Series shown: lifetime total, daily gain, or subscribers." },
      { name: "range", type: "enum", options: ["30", "90", "all"], default: "90", desc: "History window." },
    ],
  },
];

function buildRelativeUrl(ep: EndpointDef, values: Record<string, string>): string {
  let path = ep.path;
  for (const p of ep.pathParams ?? []) {
    const v = (values[p.name] ?? "").trim();
    path = path.replace(`{${p.name}}`, v ? encodeURIComponent(v) : `{${p.name}}`);
  }
  const qs = ep.queryParams
    .filter((p) => (values[p.name] ?? "").trim() !== "")
    .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent((values[p.name] ?? "").trim())}`)
    .join("&");
  return `${path}${qs ? `?${qs}` : ""}`;
}

function curlSnippet(url: string): string {
  return `curl -s "${url}" \\\n  -H "Accept: application/json"`;
}

function fetchSnippet(url: string): string {
  return `const res = await fetch("${url}", {\n  headers: { Accept: "application/json" },\n});\nif (!res.ok) throw new Error("HTTP " + res.status);\nconst data = await res.json();`;
}

function tokenizeJsonLine(line: string): Token[] {
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)|(.)/g;
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1]) {
      if (m[2]) {
        out.push({ text: m[1], cls: "key" });
        out.push({ text: m[2], cls: "punct" });
      } else {
        out.push({ text: m[1], cls: "string" });
      }
    } else if (m[3]) out.push({ text: m[3], cls: "number" });
    else if (m[4]) out.push({ text: m[4], cls: "bool" });
    else if (m[5]) out.push({ text: m[5], cls: "punct" });
    else out.push({ text: m[0], cls: "plain" });
  }
  return out.length ? out : [{ text: " ", cls: "plain" }];
}

function formatClock(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

const TOKEN_CLASS_NAME: Record<TokenClass, string> = {
  key: "tok-k",
  string: "tok-s",
  number: "tok-n",
  bool: "tok-b",
  punct: "tok-p",
  plain: "tok-x",
};

export function ApiExplorer() {
  const { game } = useGame();
  const [searchParams] = useSearchParams();
  const [devTab, setDevTab] = useState<DevTab>(() => initialDevTab(searchParams));
  const [activeKey, setActiveKey] = useState(ENDPOINTS[0].key);
  const [paramsByEndpoint, setParamsByEndpoint] = useState<Record<string, Record<string, string>>>({});
  const [tab, setTab] = useState<Tab>("body");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const [bType, setBType] = useState<BadgeType>(() =>
    searchParams.get("tab") === "badge" && searchParams.get("type") === "author" ? "author" : "plugin",
  );
  const [pluginList, setPluginList] = useState<PluginLeaderboardRow[] | null>(null);
  const [authorList, setAuthorList] = useState<AuthorLeaderboardRow[] | null>(null);
  const [bPluginId, setBPluginId] = useState<number | null>(() => initialEntityId(searchParams, "badge", "plugin"));
  const [bAuthorId, setBAuthorId] = useState<number | null>(() => initialEntityId(searchParams, "badge", "author"));
  const [bMetric, setBMetric] = useState<BadgeMetric>("downloads");
  const [bStyle, setBStyle] = useState("for-the-badge");
  const [bLabel, setBLabel] = useState("");
  const [bLabelColor, setBLabelColor] = useState("");
  const [bColor, setBColor] = useState(BADGE_COLORS[0].key);
  const [bCustomColor, setBCustomColor] = useState("");
  const [bLogo, setBLogo] = useState("");
  const [bLogoColor, setBLogoColor] = useState("");

  const [eType, setEType] = useState<BadgeType>(() =>
    searchParams.get("tab") === "embed" && searchParams.get("type") === "author" ? "author" : "plugin",
  );
  const [ePluginId, setEPluginId] = useState<number | null>(() => initialEntityId(searchParams, "embed", "plugin"));
  const [eAuthorId, setEAuthorId] = useState<number | null>(() => initialEntityId(searchParams, "embed", "author"));
  const [eTheme, setETheme] = useState<"dark" | "light">("dark");
  const [eSpark, setESpark] = useState(true);
  const [eSparkDays, setESparkDays] = useState("30");
  const [eShowSubtitle, setEShowSubtitle] = useState(true);
  const [eShowHot, setEShowHot] = useState(true);
  const [eShowStatDownloads, setEShowStatDownloads] = useState(true);
  const [eShowStatWeek, setEShowStatWeek] = useState(true);
  const [eShowStatThird, setEShowStatThird] = useState(true);
  const [eShowFooter, setEShowFooter] = useState(true);
  const [eShowImage, setEShowImage] = useState(false);
  const [eAccentColor, setEAccentColor] = useState("");
  const [eBgColor, setEBgColor] = useState("");
  const [eTextColor, setETextColor] = useState("");
  const [eShortId, setEShortId] = useState<string | null>(null);
  const [eResetConfirmOpen, setEResetConfirmOpen] = useState(false);

  const endpoint = ENDPOINTS.find((e) => e.key === activeKey)!;
  const allParams = useMemo(() => [...(endpoint.pathParams ?? []), ...endpoint.queryParams], [endpoint]);

  const values = useMemo(() => {
    const current = paramsByEndpoint[endpoint.key] ?? {};
    const out: Record<string, string> = {};
    for (const p of allParams) {
      // A "game" param defaults to whatever game the site is currently
      // scoped to, so the example request matches what you're looking at
      // instead of always starting from rs3.
      const fallback = p.name === "game" ? game : p.default;
      out[p.name] = current[p.name] ?? fallback ?? "";
    }
    return out;
  }, [paramsByEndpoint, endpoint, allParams, game]);

  const relUrl = buildRelativeUrl(endpoint, values);
  const fullUrl = `${API_BASE}${relUrl}`;

  function setParam(name: string, value: string) {
    setParamsByEndpoint((prev) => ({ ...prev, [endpoint.key]: { ...(prev[endpoint.key] ?? {}), [name]: value } }));
  }

  function resetParams() {
    setParamsByEndpoint((prev) => {
      const next = { ...prev };
      delete next[endpoint.key];
      return next;
    });
  }

  function selectEndpoint(key: string) {
    setActiveKey(key);
    setResponse(null);
    setTab("body");
  }

  async function send() {
    if (loading) return;
    setLoading(true);
    const start = performance.now();
    const ep = endpoint;
    const url = fullUrl;
    const rel = relUrl;
    const paramsSnapshot = values;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const text = await res.text();
      const ms = Math.round(performance.now() - start);
      let bodyText = text;
      let isJson = false;
      try {
        bodyText = JSON.stringify(JSON.parse(text), null, 2);
        isJson = true;
      } catch {
        // leave as raw text
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const entry: ResponseState = {
        status: res.status,
        statusText: res.statusText,
        ok: res.status >= 200 && res.status < 300,
        ms,
        size: new Blob([text]).size,
        at: new Date(),
        url: rel,
        headers,
        bodyText,
        isJson,
      };
      setResponse(entry);
      setTab((t) => (t === "curl" || t === "fetch" ? "body" : t));
      setHistory((prev) =>
        [{ epKey: ep.key, title: ep.title, status: entry.status, ok: entry.ok, time: formatClock(entry.at), relUrl: rel, params: paramsSnapshot, response: entry }, ...prev].slice(0, 8),
      );
    } catch (err) {
      const entry: ResponseState = {
        status: 0,
        statusText: "Network error",
        ok: false,
        ms: Math.round(performance.now() - start),
        size: 0,
        at: new Date(),
        url: rel,
        headers: {},
        bodyText: `Network error: ${String(err)}. The server may be offline, or it does not allow cross-origin requests from this page.`,
        isJson: false,
      };
      setResponse(entry);
      setHistory((prev) =>
        [{ epKey: ep.key, title: ep.title, status: 0, ok: false, time: formatClock(entry.at), relUrl: rel, params: paramsSnapshot, response: entry }, ...prev].slice(0, 8),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        send();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function restoreHistory(h: HistoryEntry) {
    setActiveKey(h.epKey);
    setParamsByEndpoint((prev) => ({ ...prev, [h.epKey]: h.params }));
    setResponse(h.response);
    setTab("body");
  }

  function copy(label: string, text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(label);
        setTimeout(() => setCopied(null), 1200);
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (devTab !== "badge" && devTab !== "embed" && devTab !== "api") return;
    getTopPlugins("alltime", game)
      .then((r) => setPluginList(r.plugins))
      .catch(() => setPluginList([]));
    getTopAuthors("alltime", game)
      .then((r) => setAuthorList(r.authors))
      .catch(() => setAuthorList([]));
  }, [devTab, game]);

  // A plugin/author id picked under a different game is meaningless once the
  // lists above are refetched, so drop the stale selection and let the
  // auto-select effects below pick a fresh default from the new list. Only
  // on an actual in-page game switch though -- not on first mount, where
  // the id may have just arrived from a /api?...&id=... link and must be
  // kept.
  const mountedGameRef = useRef(game);
  useEffect(() => {
    if (mountedGameRef.current === game) return;
    mountedGameRef.current = game;
    setBPluginId(null);
    setBAuthorId(null);
    setEPluginId(null);
    setEAuthorId(null);
    for (const p of allParams) {
      if (resolvePickerKind(p, values)) setParam(p.name, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(() => {
    if (bType === "plugin" && bPluginId === null && pluginList && pluginList.length > 0) setBPluginId(pluginList[0].id);
  }, [bType, pluginList, bPluginId]);

  useEffect(() => {
    if (bType === "author" && bAuthorId === null && authorList && authorList.length > 0) setBAuthorId(authorList[0].authorId);
  }, [bType, authorList, bAuthorId]);

  useEffect(() => {
    setBMetric("downloads");
  }, [bType]);

  // The API explorer tab's id-shaped params (plugin-trend's id,
  // author-profile's id, badge's key) use the same search picker as the
  // Badge/Embed builders -- auto-fill them from the top of the relevant
  // list whenever they're blank, same as bPluginId/bAuthorId above, so the
  // example URL is always runnable without the user having to search first.
  useEffect(() => {
    if (devTab !== "api") return;
    for (const p of allParams) {
      const kind = resolvePickerKind(p, values);
      if (!kind) continue;
      if ((values[p.name] ?? "").trim() !== "") continue;
      const list = kind === "plugin" ? pluginList : authorList;
      if (!list || list.length === 0) continue;
      const firstId = kind === "plugin" ? (list as PluginLeaderboardRow[])[0].id : (list as AuthorLeaderboardRow[])[0].authorId;
      setParam(p.name, String(firstId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devTab, endpoint.key, pluginList, authorList]);

  // badge's `key` means a different kind of id depending on its sibling
  // `type` param -- reset it when `type` flips so the auto-fill effect
  // above repopulates it from the correct (plugin vs author) list instead
  // of leaving e.g. a plugin id sitting in an author lookup.
  useEffect(() => {
    if (devTab !== "api") return;
    const dynamicParam = allParams.find((p) => p.pickerKindFrom);
    if (dynamicParam) setParam(dynamicParam.name, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devTab, endpoint.key, values.type]);

  const pluginItems: PickerItem[] = (pluginList ?? []).map((p) => ({ id: p.id, name: p.name, sub: `${p.authorName} · ${p.value.toLocaleString()} downloads` }));
  const authorItems: PickerItem[] = (authorList ?? []).map((a) => ({
    id: a.authorId,
    name: a.authorName,
    sub: `${a.pluginCount} plugin${a.pluginCount === 1 ? "" : "s"} · ${a.value.toLocaleString()} downloads`,
  }));

  const bKey = bType === "plugin" ? bPluginId : bAuthorId;
  const badgeEndpointUrl = bKey !== null ? `${API_BASE}/api/badge/${bType}/${bKey}/${bMetric}` : null;
  const shieldsParams = new URLSearchParams();
  if (badgeEndpointUrl) shieldsParams.set("url", badgeEndpointUrl);
  shieldsParams.set("style", bStyle);
  shieldsParams.set("color", bCustomColor.trim() || bColor);
  if (bLabel.trim()) shieldsParams.set("label", bLabel.trim());
  if (bLabelColor.trim()) shieldsParams.set("labelColor", bLabelColor.trim());
  if (bLogo.trim()) shieldsParams.set("logo", bLogo.trim());
  if (bLogoColor.trim()) shieldsParams.set("logoColor", bLogoColor.trim());
  const badgeImgUrl = badgeEndpointUrl ? `https://img.shields.io/endpoint?${shieldsParams.toString()}` : null;
  const badgePageUrl =
    bType === "plugin" && bPluginId !== null
      ? `${window.location.origin}/plugin/${bPluginId}`
      : bType === "author" && bAuthorId !== null
        ? `${window.location.origin}/author/${bAuthorId}`
        : "";
  const badgeAltText = `PluginPulse ${BADGE_LABELS[bMetric]}`;
  const badgeMarkdown = badgeImgUrl ? `[![${badgeAltText}](${badgeImgUrl})](${badgePageUrl})` : "";
  const badgeHtml = badgeImgUrl ? `<a href="${badgePageUrl}"><img alt="${badgeAltText}" src="${badgeImgUrl}"></a>` : "";

  useEffect(() => {
    if (eType === "plugin" && ePluginId === null && pluginList && pluginList.length > 0) setEPluginId(pluginList[0].id);
  }, [eType, pluginList, ePluginId]);

  useEffect(() => {
    if (eType === "author" && eAuthorId === null && authorList && authorList.length > 0) setEAuthorId(authorList[0].authorId);
  }, [eType, authorList, eAuthorId]);

  // Plugins default to the fallback icon, authors default to their real
  // profile picture -- flip the toggle's default whenever Type changes.
  useEffect(() => {
    setEShowImage(eType === "author");
  }, [eType]);

  const eKey = eType === "plugin" ? ePluginId : eAuthorId;
  const eOptionParams: Record<string, string> = {
    theme: eTheme,
    spark: eSpark ? "1" : "0",
    sparkDays: eSparkDays,
    showSubtitle: eShowSubtitle ? "1" : "0",
    showHot: eShowHot ? "1" : "0",
    showStatDownloads: eShowStatDownloads ? "1" : "0",
    showStatWeek: eShowStatWeek ? "1" : "0",
    showStatThird: eShowStatThird ? "1" : "0",
    showFooter: eShowFooter ? "1" : "0",
    showImage: eShowImage ? "1" : "0",
  };
  if (eAccentColor.trim()) eOptionParams.accentColor = eAccentColor.trim();
  if (eBgColor.trim()) eOptionParams.bgColor = eBgColor.trim();
  if (eTextColor.trim()) eOptionParams.textColor = eTextColor.trim();

  const eColorsDirty = eAccentColor.trim() !== "" || eBgColor.trim() !== "" || eTextColor.trim() !== "";
  const eIsDirty =
    eTheme !== EMBED_DEFAULTS.theme ||
    eSpark !== EMBED_DEFAULTS.spark ||
    eSparkDays !== EMBED_DEFAULTS.sparkDays ||
    eShowSubtitle !== EMBED_DEFAULTS.showSubtitle ||
    eShowHot !== EMBED_DEFAULTS.showHot ||
    eShowStatDownloads !== EMBED_DEFAULTS.showStatDownloads ||
    eShowStatWeek !== EMBED_DEFAULTS.showStatWeek ||
    eShowStatThird !== EMBED_DEFAULTS.showStatThird ||
    eShowFooter !== EMBED_DEFAULTS.showFooter ||
    eShowImage !== (eType === "author") ||
    eColorsDirty;

  function handleEmbedResetClick() {
    if (eIsDirty) setEResetConfirmOpen(true);
  }

  function resetEmbedSettings() {
    setETheme(EMBED_DEFAULTS.theme);
    setESpark(EMBED_DEFAULTS.spark);
    setESparkDays(EMBED_DEFAULTS.sparkDays);
    setEShowSubtitle(EMBED_DEFAULTS.showSubtitle);
    setEShowHot(EMBED_DEFAULTS.showHot);
    setEShowStatDownloads(EMBED_DEFAULTS.showStatDownloads);
    setEShowStatWeek(EMBED_DEFAULTS.showStatWeek);
    setEShowStatThird(EMBED_DEFAULTS.showStatThird);
    setEShowFooter(EMBED_DEFAULTS.showFooter);
    setEShowImage(eType === "author");
    setEAccentColor("");
    setEBgColor("");
    setETextColor("");
    setEResetConfirmOpen(false);
  }

  function revertEmbedColors() {
    setEAccentColor("");
    setEBgColor("");
    setETextColor("");
  }

  useEffect(() => {
    if (eKey === null) {
      setEShortId(null);
      return;
    }
    const params = new URLSearchParams({ type: eType, key: String(eKey), ...eOptionParams });
    let cancelled = false;
    fetch(`${API_BASE}/api/embed/shorten?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEShortId(d.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setEShortId(null);
      });
    return () => {
      cancelled = true;
    };
    // eOptionParams is a fresh object every render; its individual fields are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    eType,
    eKey,
    eTheme,
    eSpark,
    eSparkDays,
    eShowSubtitle,
    eShowHot,
    eShowStatDownloads,
    eShowStatWeek,
    eShowStatThird,
    eShowFooter,
    eShowImage,
    eAccentColor,
    eBgColor,
    eTextColor,
  ]);

  const eLongImgUrl = eKey !== null ? `${API_BASE}/api/card/${eType}/${eKey}.png?${new URLSearchParams(eOptionParams).toString()}` : null;
  const eShortImgUrl = eShortId ? `${API_BASE}/api/card/${eShortId}.png` : null;
  const ePageUrl =
    eType === "plugin" && ePluginId !== null
      ? `${window.location.origin}/plugin/${ePluginId}`
      : eType === "author" && eAuthorId !== null
        ? `${window.location.origin}/author/${eAuthorId}`
        : "";
  const eMarkdown = eShortImgUrl ? `[![PluginPulse stats card](${eShortImgUrl})](${ePageUrl})` : "";
  const eHtml = eShortImgUrl
    ? `<a href="${ePageUrl}"><img alt="PluginPulse stats card" src="${eShortImgUrl}" width="400"></a>`
    : "";

  const activeText =
    tab === "curl"
      ? curlSnippet(fullUrl)
      : tab === "fetch"
        ? fetchSnippet(fullUrl)
        : response
          ? tab === "body"
            ? response.bodyText
            : Object.entries(response.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n") || "(no headers)"
          : "";
  const activeIsJson = tab === "body" && !!response?.isJson;

  const showEmpty = (tab === "body" || tab === "headers") && !response;
  const allLines = activeText.split("\n");
  const codeLines = allLines.slice(0, MAX_LINES).map((l, i) => ({
    n: i + 1,
    tokens: activeIsJson ? tokenizeJsonLine(l) : [{ text: l || " ", cls: "plain" as TokenClass }],
  }));
  const truncated = allLines.length > MAX_LINES;

  return (
    <div className="page">
    <div className="board-head">
      <h1>Developers</h1>
      <p className="subtitle subtitle-sm">{DEV_SUBTITLES[devTab]}</p>

      <div role="tablist" aria-label="Developer tools" className="api-devtabs">
        {DEV_TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={devTab === t.key} className={`api-devtab ${devTab === t.key ? "active" : ""}`} onClick={() => setDevTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {devTab === "embed" && (
        <div className="card">
          <div className="card-edge" />
          <div className="api-request-head">
            <div className="api-request-title-row">
              <span className="api-request-title">Embed card</span>
              <button className="api-link-btn" onClick={handleEmbedResetClick} disabled={!eIsDirty}>
                Reset to defaults
              </button>
            </div>
            <p className="api-request-desc">
              A self-contained stats card for READMEs and websites, served as SVG and cached for about an hour. The embed link is a short id, not a
              URL full of query params.
            </p>
          </div>
          <div className="badge-builder-grid">
            <div className="badge-settings">
              <div className="badge-field">
                <span className="badge-field-label">Type</span>
                <div className="api-tabs-group" style={{ width: "fit-content" }}>
                  <button className={`api-tab-btn ${eType === "plugin" ? "active" : ""}`} onClick={() => setEType("plugin")}>
                    Plugin
                  </button>
                  <button className={`api-tab-btn ${eType === "author" ? "active" : ""}`} onClick={() => setEType("author")}>
                    Author
                  </button>
                </div>
              </div>

              <div className="badge-field">
                <span className="badge-field-label">{eType === "plugin" ? "Plugin" : "Author"}</span>
                <PluginAuthorPicker
                  items={eType === "plugin" ? pluginItems : authorItems}
                  value={eType === "plugin" ? ePluginId : eAuthorId}
                  onChange={(id) => (eType === "plugin" ? setEPluginId(id) : setEAuthorId(id))}
                  placeholder={eType === "plugin" ? "Select a plugin…" : "Select an author…"}
                  loading={eType === "plugin" ? pluginList === null : authorList === null}
                />
              </div>

              <div className="badge-field">
                <span className="badge-field-label">Theme</span>
                <div className="api-tabs-group" style={{ width: "fit-content" }}>
                  <button className={`api-tab-btn ${eTheme === "dark" ? "active" : ""}`} onClick={() => setETheme("dark")}>
                    Dark
                  </button>
                  <button className={`api-tab-btn ${eTheme === "light" ? "active" : ""}`} onClick={() => setETheme("light")}>
                    Light
                  </button>
                </div>
              </div>

              <div className="badge-field">
                <span className="badge-field-label">Sparkline</span>
                <div className="api-tabs-group" style={{ width: "fit-content" }}>
                  <button className={`api-tab-btn ${eSpark ? "active" : ""}`} onClick={() => setESpark(true)}>
                    Show
                  </button>
                  <button className={`api-tab-btn ${!eSpark ? "active" : ""}`} onClick={() => setESpark(false)}>
                    Hide
                  </button>
                </div>
              </div>

              <div className="badge-field">
                <span className="badge-field-label">Sparkline days</span>
                <input
                  className="api-text-input"
                  type="number"
                  min={7}
                  max={90}
                  value={eSparkDays}
                  onChange={(e) => setESparkDays(e.target.value)}
                  disabled={!eSpark}
                />
              </div>

              <div className="badge-field full">
                <span className="badge-field-label">Show on card</span>
                <div className="embed-toggle-grid">
                  <EmbedToggle label={eType === "plugin" ? "Plugin logo" : "Profile picture"} value={eShowImage} onChange={setEShowImage} />
                  <EmbedToggle label="Subtitle" value={eShowSubtitle} onChange={setEShowSubtitle} />
                  <EmbedToggle label="Hot pill" value={eShowHot} onChange={setEShowHot} />
                  <EmbedToggle label="Downloads" value={eShowStatDownloads} onChange={setEShowStatDownloads} />
                  <EmbedToggle label="This week" value={eShowStatWeek} onChange={setEShowStatWeek} />
                  <EmbedToggle label={eType === "plugin" ? "Subscribers" : "Today"} value={eShowStatThird} onChange={setEShowStatThird} />
                  <EmbedToggle label="Footer" value={eShowFooter} onChange={setEShowFooter} />
                </div>
              </div>

              <div className="badge-field full">
                <div className="field-label-row">
                  <span className="badge-field-label">Colors (optional overrides)</span>
                  <button className="api-link-btn" onClick={revertEmbedColors} disabled={!eColorsDirty}>
                    Revert to theme colors
                  </button>
                </div>
                <div className="embed-color-grid">
                  <label className="embed-color-field">
                    <span className="embed-toggle-label">Accent</span>
                    <div className="badge-color-field-row">
                      <input
                        type="color"
                        className="color-swatch-input"
                        value={toColorInputValue(eAccentColor, "caa44d")}
                        onChange={(e) => setEAccentColor(e.target.value.replace(/^#/, ""))}
                        aria-label="Accent color picker"
                      />
                      <input className="api-text-input" value={eAccentColor} placeholder="theme default" onChange={(e) => setEAccentColor(e.target.value)} />
                    </div>
                  </label>
                  <label className="embed-color-field">
                    <span className="embed-toggle-label">Background</span>
                    <div className="badge-color-field-row">
                      <input
                        type="color"
                        className="color-swatch-input"
                        value={toColorInputValue(eBgColor, eTheme === "light" ? "efe8da" : "151514")}
                        onChange={(e) => setEBgColor(e.target.value.replace(/^#/, ""))}
                        aria-label="Background color picker"
                      />
                      <input className="api-text-input" value={eBgColor} placeholder="theme default" onChange={(e) => setEBgColor(e.target.value)} />
                    </div>
                  </label>
                  <label className="embed-color-field">
                    <span className="embed-toggle-label">Text</span>
                    <div className="badge-color-field-row">
                      <input
                        type="color"
                        className="color-swatch-input"
                        value={toColorInputValue(eTextColor, eTheme === "light" ? "1c1912" : "ece6d6")}
                        onChange={(e) => setETextColor(e.target.value.replace(/^#/, ""))}
                        aria-label="Text color picker"
                      />
                      <input className="api-text-input" value={eTextColor} placeholder="theme default" onChange={(e) => setETextColor(e.target.value)} />
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="badge-preview-col">
              <span className="badge-field-label">Preview</span>
              <div className="badge-preview-strip dark">
                {eLongImgUrl ? <img src={eLongImgUrl} alt="" /> : <span className="badge-preview-loading">Select a plugin or author…</span>}
              </div>
              <div className="badge-preview-strip light">
                {eLongImgUrl ? <img src={eLongImgUrl} alt="" /> : <span className="badge-preview-loading">Select a plugin or author…</span>}
              </div>

              <div className="badge-snippet">
                <div className="badge-snippet-head">
                  <span>Markdown</span>
                  <button className="api-copy-btn" onClick={() => copy("embed-md", eMarkdown)}>
                    {copied === "embed-md" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="badge-snippet-code">{eMarkdown || "Select a plugin or author…"}</code>
              </div>
              <div className="badge-snippet">
                <div className="badge-snippet-head">
                  <span>HTML</span>
                  <button className="api-copy-btn" onClick={() => copy("embed-html", eHtml)}>
                    {copied === "embed-html" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="badge-snippet-code">{eHtml || "Select a plugin or author…"}</code>
              </div>
              <div className="badge-snippet">
                <div className="badge-snippet-head">
                  <span>Short image URL</span>
                  <button className="api-copy-btn" onClick={() => copy("embed-url", eShortImgUrl ?? "")}>
                    {copied === "embed-url" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="badge-snippet-code">{eShortImgUrl ?? "Generating…"}</code>
              </div>
              <div className="badge-snippet">
                <div className="badge-snippet-head">
                  <span>Long-form URL (debug, same card)</span>
                  <button className="api-copy-btn" onClick={() => copy("embed-long", eLongImgUrl ?? "")}>
                    {copied === "embed-long" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="badge-snippet-code">{eLongImgUrl ?? ""}</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {eResetConfirmOpen && (
        <ConfirmDialog
          title="Reset embed card?"
          message="This clears every toggle, the theme, sparkline length and any custom colors back to their defaults. The selected plugin or author stays the same."
          confirmLabel="Reset"
          onConfirm={resetEmbedSettings}
          onCancel={() => setEResetConfirmOpen(false)}
        />
      )}

      {devTab === "badge" && (
        <div className="card">
          <div className="card-edge" />
          <div className="api-request-head">
            <span className="api-request-title">Badge builder</span>
            <p className="api-request-desc">
              A shields.io badge wired to PluginPulse's live /api/badge endpoint — it re-fetches the current value every time it's rendered, so the badge
              keeps itself up to date once pasted into a README.
            </p>
          </div>
          <div className="badge-builder-grid">
            <div className="badge-settings">
              <div className="badge-field">
                <span className="badge-field-label">Type</span>
                <div className="api-tabs-group" style={{ width: "fit-content" }}>
                  <button className={`api-tab-btn ${bType === "plugin" ? "active" : ""}`} onClick={() => setBType("plugin")}>
                    Plugin
                  </button>
                  <button className={`api-tab-btn ${bType === "author" ? "active" : ""}`} onClick={() => setBType("author")}>
                    Author
                  </button>
                </div>
              </div>

              <div className="badge-field">
                <span className="badge-field-label">{bType === "plugin" ? "Plugin" : "Author"}</span>
                <PluginAuthorPicker
                  items={bType === "plugin" ? pluginItems : authorItems}
                  value={bType === "plugin" ? bPluginId : bAuthorId}
                  onChange={(id) => (bType === "plugin" ? setBPluginId(id) : setBAuthorId(id))}
                  placeholder={bType === "plugin" ? "Select a plugin…" : "Select an author…"}
                  loading={bType === "plugin" ? pluginList === null : authorList === null}
                />
              </div>

              <div className="badge-field">
                <span className="badge-field-label">Metric</span>
                <Dropdown
                  value={bMetric}
                  options={bType === "plugin" ? PLUGIN_METRIC_OPTIONS : AUTHOR_METRIC_OPTIONS}
                  onChange={(v) => setBMetric(v as BadgeMetric)}
                  ariaLabel="Metric"
                />
              </div>

              <div className="badge-field">
                <span className="badge-field-label">Style</span>
                <Dropdown value={bStyle} options={BADGE_STYLES.map((s) => ({ value: s, label: s }))} onChange={setBStyle} ariaLabel="Style" />
              </div>

              <div className="badge-field">
                <span className="badge-field-label">Label</span>
                <input className="api-text-input" value={bLabel} placeholder={BADGE_LABELS[bMetric]} onChange={(e) => setBLabel(e.target.value)} />
              </div>

              <div className="badge-field">
                <span className="badge-field-label">Label color</span>
                <div className="badge-color-field-row">
                  <input
                    type="color"
                    className="color-swatch-input"
                    value={toColorInputValue(bLabelColor)}
                    onChange={(e) => setBLabelColor(e.target.value.replace(/^#/, ""))}
                    aria-label="Label color picker"
                  />
                  <input
                    className="api-text-input"
                    value={bLabelColor}
                    placeholder="e.g. 555 (hex, no #)"
                    onChange={(e) => setBLabelColor(e.target.value)}
                  />
                </div>
              </div>

              <div className="badge-field">
                <span className="badge-field-label">Logo</span>
                <input className="api-text-input" value={bLogo} placeholder="simple-icons slug, e.g. github" onChange={(e) => setBLogo(e.target.value)} />
              </div>

              <div className="badge-field">
                <span className="badge-field-label">Logo color</span>
                <div className="badge-color-field-row">
                  <input
                    type="color"
                    className="color-swatch-input"
                    value={toColorInputValue(bLogoColor, "ffffff")}
                    onChange={(e) => setBLogoColor(e.target.value.replace(/^#/, ""))}
                    aria-label="Logo color picker"
                    disabled={!bLogo.trim()}
                  />
                  <input
                    className="api-text-input"
                    value={bLogoColor}
                    placeholder="e.g. fff (hex, no #)"
                    onChange={(e) => setBLogoColor(e.target.value)}
                    disabled={!bLogo.trim()}
                  />
                </div>
              </div>

              <div className="badge-field full">
                <span className="badge-field-label">Message color</span>
                <div className="badge-color-row">
                  <div className="api-tabs-group badge-color-group">
                    {BADGE_COLORS.map((c) => (
                      <button
                        key={c.key}
                        className={`api-tab-btn badge-color-btn ${!bCustomColor.trim() && bColor === c.key ? "active" : ""}`}
                        onClick={() => {
                          setBColor(c.key);
                          setBCustomColor("");
                        }}
                      >
                        <span className="badge-color-dot" style={{ background: `#${c.key}` }} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="badge-color-field-row badge-custom-color-input">
                    <input
                      type="color"
                      className="color-swatch-input"
                      value={toColorInputValue(bCustomColor || bColor)}
                      onChange={(e) => setBCustomColor(e.target.value.replace(/^#/, ""))}
                      aria-label="Message color picker"
                    />
                    <input
                      className="api-text-input"
                      value={bCustomColor}
                      placeholder="or custom hex, e.g. 1f883d"
                      onChange={(e) => setBCustomColor(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="badge-preview-col">
              <span className="badge-field-label">Preview</span>
              <div className="badge-preview-strip dark">
                {badgeImgUrl ? <img src={badgeImgUrl} alt="" /> : <span className="badge-preview-loading">Select a plugin or author…</span>}
              </div>
              <div className="badge-preview-strip light">
                {badgeImgUrl ? <img src={badgeImgUrl} alt="" /> : <span className="badge-preview-loading">Select a plugin or author…</span>}
              </div>

              <div className="badge-snippet">
                <div className="badge-snippet-head">
                  <span>Markdown</span>
                  <button className="api-copy-btn" onClick={() => copy("badge-md", badgeMarkdown)}>
                    {copied === "badge-md" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="badge-snippet-code">{badgeMarkdown}</code>
              </div>
              <div className="badge-snippet">
                <div className="badge-snippet-head">
                  <span>HTML</span>
                  <button className="api-copy-btn" onClick={() => copy("badge-html", badgeHtml)}>
                    {copied === "badge-html" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="badge-snippet-code">{badgeHtml}</code>
              </div>
              <div className="badge-snippet">
                <div className="badge-snippet-head">
                  <span>Image URL</span>
                  <button className="api-copy-btn" onClick={() => copy("badge-url", badgeImgUrl ?? "")}>
                    {copied === "badge-url" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="badge-snippet-code">{badgeImgUrl ?? ""}</code>
              </div>
              <div className="badge-snippet">
                <div className="badge-snippet-head">
                  <span>Endpoint JSON URL</span>
                  <button className="api-copy-btn" onClick={() => copy("badge-endpoint", badgeEndpointUrl ?? "")}>
                    {copied === "badge-endpoint" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="badge-snippet-code">{badgeEndpointUrl ?? ""}</code>
              </div>
            </div>
          </div>
        </div>
      )}

      {devTab === "api" && (
      <div className="api-layout">
        <aside className="api-aside">
          <div className="card">
            <div className="card-edge" />
            <div className="api-card-label">Endpoints</div>
            <div className="api-eps-list">
              {ENDPOINTS.map((e) => (
                <button key={e.key} className={`api-ep-row ${e.key === activeKey ? "active" : ""}`} onClick={() => selectEndpoint(e.key)}>
                  <span className="api-method-pill">GET</span>
                  <span className="api-ep-info">
                    <span className="api-ep-title">{e.title}</span>
                    <span className="api-ep-path">{e.path}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {history.length > 0 && (
            <div className="card">
              <div className="api-recent-head">
                <span className="api-card-label" style={{ padding: 0 }}>
                  Recent
                </span>
                <button className="api-link-btn" onClick={() => setHistory([])}>
                  Clear
                </button>
              </div>
              {history.map((h, i) => (
                <button key={i} className="api-recent-row" onClick={() => restoreHistory(h)}>
                  <span className="api-recent-row-top">
                    <span className={`api-recent-status ${h.ok ? "" : "error"}`}>{h.status || "ERR"}</span>
                    <span className="api-recent-title">{h.title}</span>
                    <span className="api-recent-time">{h.time}</span>
                  </span>
                  <span className="api-recent-path">{h.relUrl}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="api-main">
          <div className="card">
            <div className="card-edge" />
            <div className="api-request-head">
              <div className="api-request-title-row">
                <span className="api-request-title">{endpoint.title}</span>
                <span className="api-request-path-text">{endpoint.path}</span>
              </div>
              <p className="api-request-desc">{endpoint.desc}</p>
            </div>

            <div className="api-request-bar">
              <span className="api-base-label">{API_BASE.replace(/^https?:\/\//, "")}</span>
              <div className="api-url-box">
                <span className="api-method-pill">GET</span>
                <span className="api-url-text" title={relUrl}>
                  {relUrl}
                </span>
                <button className="api-copy-btn" onClick={() => copy("url", fullUrl)}>
                  {copied === "url" ? "Copied" : "Copy"}
                </button>
              </div>
              <button className="api-send-btn" onClick={send} disabled={loading}>
                {loading ? "Sending…" : "Send"}
              </button>
            </div>
            <div className="api-request-note">Live request from your browser to the real PluginPulse API. Ctrl / Cmd + Enter sends it too.</div>

            {endpoint.pathParams && endpoint.pathParams.length > 0 && (
              <>
                <div className="api-params-head">Path parameters</div>
                {endpoint.pathParams.map((p) => (
                  <ParamRow
                    key={p.name}
                    param={p}
                    value={values[p.name]}
                    onChange={(v) => setParam(p.name, v)}
                    pickerKind={resolvePickerKind(p, values)}
                    pluginItems={pluginItems}
                    authorItems={authorItems}
                    pickerLoading={pluginList === null || authorList === null}
                  />
                ))}
              </>
            )}

            {endpoint.queryParams.length > 0 && (
              <>
                <div className="api-params-head">
                  Query parameters
                  <button className="api-link-btn" onClick={resetParams}>
                    Reset to defaults
                  </button>
                </div>
                {endpoint.queryParams.map((p) => (
                  <ParamRow
                    key={p.name}
                    param={p}
                    value={values[p.name]}
                    onChange={(v) => setParam(p.name, v)}
                    pickerKind={resolvePickerKind(p, values)}
                    pluginItems={pluginItems}
                    authorItems={authorItems}
                    pickerLoading={pluginList === null || authorList === null}
                  />
                ))}
              </>
            )}
          </div>

          <div className="card">
            <div className="api-response-head">
              <div className="api-response-head-left">
                <span className="api-response-label">Response</span>
                {response && (
                  <>
                    <span className={`api-status-pill ${response.ok ? "" : "error"}`}>
                      {response.status || "ERR"} {response.statusText}
                    </span>
                    <span className="api-response-meta">
                      {response.ms} ms · {formatBytes(response.size)} · {formatClock(response.at)}
                    </span>
                  </>
                )}
                {loading && <span className="api-sending">Sending…</span>}
              </div>
              <div className="api-response-head-right">
                <div className="api-tabs-group">
                  {TAB_LABELS.map((t) => (
                    <button key={t.key} className={`api-tab-btn ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <button className="api-copy-btn lg" onClick={() => copy("res", activeText)}>
                  {copied === "res" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {response && <div className="api-response-url">GET {response.url}</div>}

            {showEmpty ? (
              <div className="api-empty-state">
                <img src="/logo/icon-2-hex-mono-gold.svg" alt="" />
                <span className="api-empty-title">No response yet</span>
                <span className="api-empty-sub">Press Send or Ctrl + Enter to run the request.</span>
              </div>
            ) : (
              <>
                <div className={`api-code ${loading ? "loading" : ""}`}>
                  {codeLines.map((l) => (
                    <div key={l.n} className="api-code-line">
                      <span className="api-code-line-num">{l.n}</span>
                      <span className="api-code-line-content">
                        {l.tokens.map((t, i) => (
                          <span key={i} className={TOKEN_CLASS_NAME[t.cls]}>
                            {t.text}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                {truncated && <div className="api-trunc-note">Showing the first {MAX_LINES} of {allLines.length} lines. Copy to get the full response.</div>}
              </>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
    </div>
  );
}

function EmbedToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="embed-toggle">
      <span className="embed-toggle-label">{label}</span>
      <div className="api-tabs-group" style={{ width: "fit-content" }}>
        <button className={`api-tab-btn ${value ? "active" : ""}`} onClick={() => onChange(true)}>
          Show
        </button>
        <button className={`api-tab-btn ${!value ? "active" : ""}`} onClick={() => onChange(false)}>
          Hide
        </button>
      </div>
    </div>
  );
}

function ParamRow({
  param,
  value,
  onChange,
  pickerKind,
  pluginItems,
  authorItems,
  pickerLoading,
}: {
  param: ParamDef;
  value: string;
  onChange: (v: string) => void;
  pickerKind?: "plugin" | "author" | null;
  pluginItems?: PickerItem[];
  authorItems?: PickerItem[];
  pickerLoading?: boolean;
}) {
  const typeLabel = param.type === "enum" ? (param.options ?? []).join(" | ") : param.type;
  return (
    <div className="api-param-row">
      <div className="api-param-info">
        <div className="api-param-name-row">
          <span className="api-param-name">{param.name}</span>
          <span className="api-param-type">{typeLabel}</span>
          {param.required && <span className="api-param-required">REQUIRED</span>}
        </div>
        <span className="api-param-desc">{param.desc}</span>
      </div>
      <div className="api-param-input">
        {pickerKind ? (
          <PluginAuthorPicker
            items={(pickerKind === "plugin" ? pluginItems : authorItems) ?? []}
            value={value.trim() === "" ? null : Number(value)}
            onChange={(id) => onChange(String(id))}
            placeholder={pickerKind === "plugin" ? "Search plugins…" : "Search authors…"}
            loading={pickerLoading}
          />
        ) : param.type === "enum" ? (
          <Dropdown value={value} options={(param.options ?? []).map((o) => ({ value: o, label: o }))} onChange={onChange} ariaLabel={param.name} />
        ) : (
          <input
            className="api-text-input"
            type={param.type === "int" ? "number" : "text"}
            value={value}
            placeholder={param.placeholder ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}
