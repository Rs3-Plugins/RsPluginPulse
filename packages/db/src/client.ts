import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString,
      // pg's own default (0, i.e. wait forever) means a pool genuinely
      // exhausted under load hangs every new request indefinitely instead
      // of failing fast with a clear error -- 5s is generous for a local/
      // same-region Postgres connection, so this only ever bites during an
      // actual exhaustion/outage, not routine latency.
      connectionTimeoutMillis: 5000,
      // pg's own default (10) is tight for this app: a single request
      // routinely fans out several queries at once via Promise.all
      // (getPluginInfo, getAuthorProfile, getStatsOverview, ...), so a
      // handful of concurrent *requests* was enough to exhaust 10
      // connections and start queueing behind connectionTimeoutMillis.
      // 20 stays well clear of the shared Postgres cluster's
      // max_connections=100 (see deploy/README.md's Postgres tuning
      // section -- another app shares that same instance).
      max: 20,
    });
  }
  return pool;
}
