// One-off (but reusable) import of a MariaDB dump of runelite.phyce.dev's
// own install-count history, with explicit permission from phyce to pull
// this data -- see the PR/session notes. Two phases:
//
//   1. Import the dump: downsample its per-plugin install_counts history
//      to one reading per (plugin, UTC hour) -- the last reading of that
//      hour, inserted at that hour's exact top-of-hour timestamp -- and
//      skip today (the dump is always somewhat stale by the time you run
//      this). Hour-level (not day-level) so this also backfills a plugin
//      that's missing a handful of hours inside a day that otherwise has
//      coverage -- a whole-day gap just ends up filling all 24 of its
//      hours instead of one. "Already have a snapshot for this hour" is
//      decided entirely by the database's own ON CONFLICT (plugin_id,
//      captured_at) DO NOTHING, not an in-memory set -- an earlier version
//      tracked every (plugin, hour) pair seen in a Set to skip duplicates,
//      which grew past tens of millions of entries against a sparsely-
//      covered catalog and blew through V8's hard Set-size ceiling,
//      killing the import outright.
//   2. Catch up today: a dump is only ever current as of whenever it was
//      generated, so phase 2 asks phyce's own /plugins endpoint (one
//      request, current state for every plugin -- NOT the per-plugin
//      /history endpoint, which returns a plugin's *entire* history and
//      would mean one huge request per plugin for no reason) for right
//      now's install count and inserts it as a single fresh snapshot per
//      plugin. The next scheduled `npm run ingest:runelite` run then picks
//      up from there as normal.
//
// Usage: DATABASE_URL=... tsx src/import-phyce-dump.ts <path-to-dump.sql>
//
// Only use this occasionally (whenever phyce hands over a fresh dump) --
// phase 2 is a single lightweight request, but re-running phase 1 against
// the same dump repeatedly is pointless (it only ever adds hours you don't
// already have).
import fs from "fs";
import readline from "readline";
import { getPool } from "@rspluginpulse/db";

const GAME = "runelite";
const INSERT_CHUNK = 2000;
const PLUGINS_TAIL_WINDOW_BYTES = 20 * 1024 * 1024; // generous margin for the `plugins` table, which sits at the end of the dump
const ROW_RE = /^\((\d+),(\d+),(\d+),'(\d{4}-\d{2}-\d{2}) ([\d:.]+)','[\d: .-]+'\)[,;]?\s*$/;

function readTail(filePath: string, maxBytes: number): string {
  const { size } = fs.statSync(filePath);
  const start = Math.max(0, size - maxBytes);
  const buf = Buffer.alloc(size - start);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buf, 0, buf.length, start);
  } finally {
    fs.closeSync(fd);
  }
  return buf.toString("utf8");
}

// mysqldump splits one logical INSERT into several statements once it's
// big, so scanning must skip over "INSERT INTO ... VALUES" separator text
// between them rather than stopping at the first semicolon.
function parsePluginsTable(text: string): Map<number, string | null> {
  const marker = "INSERT INTO `plugins` VALUES";
  const start = text.indexOf(marker);
  if (start === -1) return new Map();
  let i = start + marker.length;
  while (text[i] !== "(") i++;

  const rows: string[] = [];
  let depth = 0;
  let inString = false;
  let rowStart = -1;
  for (; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === "'") inString = false;
      continue;
    }
    if (c === "'") {
      inString = true;
      continue;
    }
    if (c === "(") {
      if (depth === 0) rowStart = i + 1;
      depth++;
      continue;
    }
    if (c === ")") {
      depth--;
      if (depth === 0) rows.push(text.slice(rowStart, i));
      continue;
    }
  }

  function parseIdAndFilename(row: string): { id: number; filename: string | null } {
    let j = 0;
    let idStr = "";
    while (row[j] !== ",") {
      idStr += row[j];
      j++;
    }
    j++;
    while (row[j] === " ") j++;
    if (row.slice(j, j + 4) === "NULL") return { id: Number(idStr), filename: null };
    j++; // opening quote
    let filename = "";
    while (true) {
      const c = row[j];
      if (c === "\\") {
        filename += row[j + 1];
        j += 2;
        continue;
      }
      if (c === "'") break;
      filename += c;
      j++;
    }
    return { id: Number(idStr), filename };
  }

  const map = new Map<number, string | null>();
  for (const row of rows) {
    const { id, filename } = parseIdAndFilename(row);
    map.set(id, filename);
  }
  return map;
}

async function insertRows(pool: ReturnType<typeof getPool>, rows: { pluginId: number; capturedAt: string; count: number }[]) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((row, idx) => {
      const base = idx * 5;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, 0, $${base + 4}, $${base + 5})`);
      params.push(row.pluginId, row.capturedAt, row.count, row.count, GAME);
    });
    const result = await pool.query(
      `INSERT INTO plugin_snapshots (plugin_id, captured_at, downloads_total, downloads_today, subscribers_total, game)
       VALUES ${values.join(",")}
       ON CONFLICT (plugin_id, captured_at) DO NOTHING`,
      params,
    );
    // rowCount, not chunk.length -- ON CONFLICT DO NOTHING silently skips
    // rows that already exist (e.g. re-running against the same dump, or
    // a day the dump and a prior catch-up run both happened to cover), and
    // the point of this log line is telling you how many were *actually*
    // new.
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

async function main() {
  const dumpPath = process.argv[2];
  if (!dumpPath) {
    console.error("usage: tsx src/import-phyce-dump.ts <path-to-dump.sql>");
    process.exit(1);
  }
  if (!fs.existsSync(dumpPath)) {
    console.error(`file not found: ${dumpPath}`);
    process.exit(1);
  }

  const pool = getPool();

  console.log("reading the `plugins` table from the tail of the dump...");
  const tail = readTail(dumpPath, PLUGINS_TAIL_WINDOW_BYTES);
  const phyceIdToFilename = parsePluginsTable(tail);
  if (phyceIdToFilename.size === 0) {
    console.error("couldn't find/parse the `plugins` table -- is this a phyce runelite_stats dump? try raising PLUGINS_TAIL_WINDOW_BYTES.");
    process.exit(1);
  }
  console.log(`  found ${phyceIdToFilename.size} plugins in the dump`);

  const { rows: mapRows } = await pool.query(`SELECT external_key, id FROM external_id_map WHERE game = $1 AND kind = 'plugin'`, [GAME]);
  const filenameToOurId = new Map<string, number>(mapRows.map((r) => [r.external_key, r.id]));

  const phyceIdToOurId = new Map<number, number>();
  for (const [phyceId, filename] of phyceIdToFilename) {
    if (filename === null) continue;
    const ourId = filenameToOurId.get(filename);
    if (ourId !== undefined) phyceIdToOurId.set(phyceId, ourId);
  }
  console.log(`  matched ${phyceIdToOurId.size} of them to our own catalog`);

  const today = new Date().toISOString().slice(0, 10);
  // Dedup is done entirely via the DB's own ON CONFLICT (plugin_id,
  // captured_at) DO NOTHING -- not an in-memory "already covered" Set.
  // An earlier version tracked every (plugin, hour) pair ever seen in a
  // Set to skip re-inserting it, both for pre-existing DB coverage and
  // across flush batches within this same run; against a sparsely-covered
  // catalog that Set grew past tens of millions of entries and blew
  // through V8's hard Set-size ceiling ("Set maximum size exceeded"),
  // killing the import outright. `pending` only ever needs to collapse
  // repeat readings for the same hour *within the current batch* (last
  // reading of the hour wins there); letting Postgres's own unique index
  // catch everything else -- pre-existing rows, and rows written by an
  // earlier batch in this same run -- means nothing in memory grows
  // without bound regardless of dump size or how little history already
  // existed.
  const FLUSH_EVERY = 200_000;
  let pending = new Map<string, { pluginId: number; capturedAt: string; count: number }>();
  let inserted = 0;

  async function flushPending() {
    if (pending.size === 0) return;
    const toInsert = Array.from(pending.values());
    pending = new Map();
    inserted += await insertRows(pool, toInsert);
  }

  console.log("streaming the dump's plugin_installs rows (this is the slow part -- a 2-3GB dump takes a few minutes)...");
  let lineCount = 0;
  let matchedCount = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(dumpPath, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    lineCount++;
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const phycePluginId = Number(m[2]);
    const count = Number(m[3]);
    const day = m[4];
    const time = m[5];
    const ourId = phyceIdToOurId.get(phycePluginId);
    if (ourId === undefined) continue;
    if (day === today) continue;
    matchedCount++;
    const hour = time.slice(0, 2);
    const key = `${ourId}|${day}T${hour}`;
    // Truncated to the hour (not the dump's raw second-precision reading)
    // so the same (plugin, hour) always produces the exact same
    // captured_at -- that's what lets ON CONFLICT DO NOTHING actually
    // catch a duplicate, whether it's a row this same run already wrote
    // in an earlier batch or one a previous run of this script wrote. It
    // won't catch a dump hour that's already covered by *real* hourly
    // ingest, since that lands on its own non-round second -- a small,
    // bounded amount of redundant overlap for whatever recent window the
    // dump and real ingest both cover, not a correctness problem.
    pending.set(key, { pluginId: ourId, capturedAt: `${day}T${hour}:00:00.000Z`, count });
    if (pending.size >= FLUSH_EVERY) await flushPending();
    if (lineCount % 5_000_000 === 0) console.log(`  ...${lineCount.toLocaleString()} lines scanned, ${inserted.toLocaleString()} inserted so far`);
  }
  await flushPending();
  console.log(`  scanned ${lineCount.toLocaleString()} lines, ${matchedCount.toLocaleString()} matched our catalog`);
  console.log(`  done, ${inserted.toLocaleString()} new (plugin, hour) snapshots inserted from the dump`);

  console.log("\ncatching up to now via phyce's /plugins endpoint (a single request, current state for every plugin)...");
  const res = await fetch("https://api-runelite.phyce.dev/plugins");
  if (!res.ok) throw new Error(`GET /plugins -> HTTP ${res.status}`);
  const body = (await res.json()) as { success: boolean; data: { name: string; current_installs: number }[] };
  const capturedAt = new Date().toISOString();
  const catchUpRows = body.data
    .map((p) => {
      const ourId = filenameToOurId.get(p.name);
      if (ourId === undefined) return null;
      return { pluginId: ourId, capturedAt, count: p.current_installs };
    })
    .filter((r): r is { pluginId: number; capturedAt: string; count: number } => r !== null);
  console.log(`  ${body.data.length} plugins reported, ${catchUpRows.length} matched our catalog`);
  const caughtUp = await insertRows(pool, catchUpRows);
  console.log(`  done, inserted ${caughtUp.toLocaleString()} fresh snapshots at ${capturedAt}`);

  console.log("\nall done. the next scheduled `npm run ingest:runelite` run continues from here as normal.");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
