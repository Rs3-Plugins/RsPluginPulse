// Reports missing-coverage hours in plugin_snapshots between two dates --
// run this first to see what's actually missing before reaching for
// import-phyce-dump.ts (which fills hour-level gaps, see its own comment,
// but doesn't tell you where they are).
//
// Usage: DATABASE_URL=... tsx src/find-gaps.ts <startDate> [endDate] [game]
//   startDate/endDate: "YYYY-MM-DD" or any ISO timestamp, UTC. endDate
//     defaults to now; a bare "YYYY-MM-DD" end date is treated as the end
//     of that day (23:59:59 UTC) so a single-day range isn't empty.
//   game: "runelite" (default) or "runescape"
//
// A "full gap" hour has zero snapshots at all for the game (ingest likely
// didn't run that hour); a "partial" hour has some but not all plugins
// covered (a handful of per-plugin fetch failures, not a missed run).
// Every plugin ever added shows up in the denominator, including ones
// added after the range started -- so the earliest hours of a long range
// will always show as "partial" for plugins that didn't exist yet. That's
// expected, not a real gap; sanity-check against the plugin's own
// date_added before treating an early partial hour as something to backfill.
import { getPool } from "@rspluginpulse/db";

const HOUR_MS = 60 * 60 * 1000;

function parseBound(raw: string | undefined, fallback: Date, isEnd: boolean): Date {
  if (!raw) return fallback;
  const bareDate = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = new Date(bareDate && isEnd ? `${raw}T23:59:59.999Z` : raw);
  if (Number.isNaN(date.getTime())) {
    console.error(`couldn't parse date: "${raw}" (try "YYYY-MM-DD" or a full ISO timestamp)`);
    process.exit(1);
  }
  return date;
}

async function main() {
  const [startArg, endArg, gameArg] = process.argv.slice(2);
  if (!startArg) {
    console.error("usage: tsx src/find-gaps.ts <startDate> [endDate] [game]");
    console.error('  e.g.: tsx src/find-gaps.ts 2026-05-01 2026-06-01 runelite');
    process.exit(1);
  }
  const game = gameArg ?? "runelite";
  const start = parseBound(startArg, new Date(0), false);
  const end = parseBound(endArg, new Date(), true);
  if (start >= end) {
    console.error(`start (${start.toISOString()}) must be before end (${end.toISOString()})`);
    process.exit(1);
  }

  const pool = getPool();

  const { rows: totalRows } = await pool.query(`SELECT count(*)::int AS n FROM plugins WHERE game = $1`, [game]);
  const totalPlugins = totalRows[0].n;
  console.log(`${totalPlugins} ${game} plugins in the catalog (used as the "full coverage" denominator below)`);

  console.log(`checking ${start.toISOString()} .. ${end.toISOString()} for gaps...`);
  const { rows } = await pool.query(
    `SELECT date_trunc('hour', s.captured_at AT TIME ZONE 'UTC') AS hour, count(DISTINCT s.plugin_id)::int AS plugins
     FROM plugin_snapshots s
     JOIN plugins p ON p.id = s.plugin_id
     WHERE p.game = $1 AND s.captured_at BETWEEN $2 AND $3
     GROUP BY hour
     ORDER BY hour`,
    [game, start, end],
  );
  const coverage = new Map<number, number>(rows.map((r) => [r.hour.getTime(), r.plugins]));

  const firstHour = Math.floor(start.getTime() / HOUR_MS) * HOUR_MS;
  const lastHour = Math.ceil(end.getTime() / HOUR_MS) * HOUR_MS;

  let fullGaps = 0;
  let partialGaps = 0;
  let covered = 0;
  const lines: string[] = [];
  for (let h = firstHour; h <= lastHour; h += HOUR_MS) {
    const plugins = coverage.get(h) ?? 0;
    if (plugins >= totalPlugins) {
      covered++;
      continue;
    }
    const iso = new Date(h).toISOString().slice(0, 13).replace("T", " ") + ":00";
    if (plugins === 0) {
      fullGaps++;
      lines.push(`  GAP      ${iso}  0/${totalPlugins} plugins`);
    } else {
      partialGaps++;
      const pct = Math.round((plugins / totalPlugins) * 100);
      lines.push(`  partial  ${iso}  ${plugins}/${totalPlugins} plugins (${pct}%)`);
    }
  }

  if (lines.length === 0) {
    console.log("\nno gaps -- every hour in range has a snapshot for every plugin in the catalog.");
  } else {
    console.log("");
    console.log(lines.join("\n"));
  }
  console.log(`\n${covered} fully covered, ${partialGaps} partial, ${fullGaps} full gaps (of ${covered + partialGaps + fullGaps} hours checked)`);
  if (fullGaps > 0) {
    console.log("full gaps are the best candidates for import-phyce-dump.ts -- partial gaps may just be plugins added after the range started.");
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
