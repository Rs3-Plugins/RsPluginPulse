"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// One-off (but reusable) import of a MariaDB dump of runelite.phyce.dev's
// own install-count history, with explicit permission from phyce to pull
// this data -- see the PR/session notes. Two phases:
//
//   1. Import the dump: downsample its per-plugin install_counts history
//      to one reading per (plugin, UTC day) -- the last reading of that
//      day -- skipping today (the dump is always somewhat stale by the
//      time you run this) and any day we already have a snapshot for.
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
// the same dump repeatedly is pointless (it only ever adds days you don't
// already have).
const fs_1 = __importDefault(require("fs"));
const readline_1 = __importDefault(require("readline"));
const db_1 = require("@rspluginpulse/db");
const GAME = "runelite";
const INSERT_CHUNK = 2000;
const PLUGINS_TAIL_WINDOW_BYTES = 20 * 1024 * 1024; // generous margin for the `plugins` table, which sits at the end of the dump
const ROW_RE = /^\((\d+),(\d+),(\d+),'(\d{4}-\d{2}-\d{2}) ([\d:.]+)','[\d: .-]+'\)[,;]?\s*$/;
function readTail(filePath, maxBytes) {
    const { size } = fs_1.default.statSync(filePath);
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    const fd = fs_1.default.openSync(filePath, "r");
    try {
        fs_1.default.readSync(fd, buf, 0, buf.length, start);
    }
    finally {
        fs_1.default.closeSync(fd);
    }
    return buf.toString("utf8");
}
// mysqldump splits one logical INSERT into several statements once it's
// big, so scanning must skip over "INSERT INTO ... VALUES" separator text
// between them rather than stopping at the first semicolon.
function parsePluginsTable(text) {
    const marker = "INSERT INTO `plugins` VALUES";
    const start = text.indexOf(marker);
    if (start === -1)
        return new Map();
    let i = start + marker.length;
    while (text[i] !== "(")
        i++;
    const rows = [];
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
            if (c === "'")
                inString = false;
            continue;
        }
        if (c === "'") {
            inString = true;
            continue;
        }
        if (c === "(") {
            if (depth === 0)
                rowStart = i + 1;
            depth++;
            continue;
        }
        if (c === ")") {
            depth--;
            if (depth === 0)
                rows.push(text.slice(rowStart, i));
            continue;
        }
    }
    function parseIdAndFilename(row) {
        let j = 0;
        let idStr = "";
        while (row[j] !== ",") {
            idStr += row[j];
            j++;
        }
        j++;
        while (row[j] === " ")
            j++;
        if (row.slice(j, j + 4) === "NULL")
            return { id: Number(idStr), filename: null };
        j++; // opening quote
        let filename = "";
        while (true) {
            const c = row[j];
            if (c === "\\") {
                filename += row[j + 1];
                j += 2;
                continue;
            }
            if (c === "'")
                break;
            filename += c;
            j++;
        }
        return { id: Number(idStr), filename };
    }
    const map = new Map();
    for (const row of rows) {
        const { id, filename } = parseIdAndFilename(row);
        map.set(id, filename);
    }
    return map;
}
async function insertRows(pool, rows) {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        const values = [];
        const params = [];
        chunk.forEach((row, idx) => {
            const base = idx * 5;
            values.push(`($${base + 1}, $${base + 2}, $${base + 3}, 0, $${base + 4}, $${base + 5})`);
            params.push(row.pluginId, row.capturedAt, row.count, row.count, GAME);
        });
        const result = await pool.query(`INSERT INTO plugin_snapshots (plugin_id, captured_at, downloads_total, downloads_today, subscribers_total, game)
       VALUES ${values.join(",")}
       ON CONFLICT (plugin_id, captured_at) DO NOTHING`, params);
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
    if (!fs_1.default.existsSync(dumpPath)) {
        console.error(`file not found: ${dumpPath}`);
        process.exit(1);
    }
    const pool = (0, db_1.getPool)();
    console.log("reading the `plugins` table from the tail of the dump...");
    const tail = readTail(dumpPath, PLUGINS_TAIL_WINDOW_BYTES);
    const phyceIdToFilename = parsePluginsTable(tail);
    if (phyceIdToFilename.size === 0) {
        console.error("couldn't find/parse the `plugins` table -- is this a phyce runelite_stats dump? try raising PLUGINS_TAIL_WINDOW_BYTES.");
        process.exit(1);
    }
    console.log(`  found ${phyceIdToFilename.size} plugins in the dump`);
    const { rows: mapRows } = await pool.query(`SELECT external_key, id FROM external_id_map WHERE game = $1 AND kind = 'plugin'`, [GAME]);
    const filenameToOurId = new Map(mapRows.map((r) => [r.external_key, r.id]));
    const phyceIdToOurId = new Map();
    for (const [phyceId, filename] of phyceIdToFilename) {
        if (filename === null)
            continue;
        const ourId = filenameToOurId.get(filename);
        if (ourId !== undefined)
            phyceIdToOurId.set(phyceId, ourId);
    }
    console.log(`  matched ${phyceIdToOurId.size} of them to our own catalog`);
    const ourIds = Array.from(new Set(phyceIdToOurId.values()));
    const { rows: existingRows } = await pool.query(`SELECT plugin_id, (captured_at AT TIME ZONE 'UTC')::date AS day FROM plugin_snapshots WHERE plugin_id = ANY($1)`, [ourIds]);
    const existingDays = new Set(existingRows.map((r) => `${r.plugin_id}|${r.day.toISOString().slice(0, 10)}`));
    console.log(`  ${existingDays.size} (plugin, day) pairs already covered -- these will be skipped`);
    const today = new Date().toISOString().slice(0, 10);
    const lastOfDay = new Map();
    console.log("streaming the dump's plugin_installs rows (this is the slow part -- a 2-3GB dump takes a few minutes)...");
    let lineCount = 0;
    let matchedCount = 0;
    const rl = readline_1.default.createInterface({ input: fs_1.default.createReadStream(dumpPath, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl) {
        lineCount++;
        const m = ROW_RE.exec(line);
        if (!m)
            continue;
        const phycePluginId = Number(m[2]);
        const count = Number(m[3]);
        const day = m[4];
        const time = m[5];
        const ourId = phyceIdToOurId.get(phycePluginId);
        if (ourId === undefined)
            continue;
        if (day === today)
            continue;
        matchedCount++;
        const key = `${ourId}|${day}`;
        if (existingDays.has(key))
            continue;
        lastOfDay.set(key, { pluginId: ourId, capturedAt: `${day}T${time}Z`, count });
        if (lineCount % 5_000_000 === 0)
            console.log(`  ...${lineCount.toLocaleString()} lines scanned, ${lastOfDay.size.toLocaleString()} pending`);
    }
    console.log(`  scanned ${lineCount.toLocaleString()} lines, ${matchedCount.toLocaleString()} matched our catalog`);
    const toInsert = Array.from(lastOfDay.values());
    console.log(`inserting ${toInsert.length.toLocaleString()} candidate (plugin, day) snapshots from the dump...`);
    const inserted = await insertRows(pool, toInsert);
    console.log(`  done, ${inserted.toLocaleString()} were actually new (the rest already existed)`);
    console.log("\ncatching up to now via phyce's /plugins endpoint (a single request, current state for every plugin)...");
    const res = await fetch("https://api-runelite.phyce.dev/plugins");
    if (!res.ok)
        throw new Error(`GET /plugins -> HTTP ${res.status}`);
    const body = (await res.json());
    const capturedAt = new Date().toISOString();
    const catchUpRows = body.data
        .map((p) => {
        const ourId = filenameToOurId.get(p.name);
        if (ourId === undefined)
            return null;
        return { pluginId: ourId, capturedAt, count: p.current_installs };
    })
        .filter((r) => r !== null);
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
