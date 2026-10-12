// Local-only dev helper: runs a real Postgres binary with no system install
// or Docker required. Not used in production — point DATABASE_URL at a real
// managed Postgres there instead.
import { existsSync } from "node:fs";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

export const LOCAL_PG_PORT = 55432;
export const LOCAL_PG_USER = "rspluginpulse";
export const LOCAL_PG_PASSWORD = "rspluginpulse";
export const LOCAL_PG_DATABASE = "rspluginpulse";
export const LOCAL_DATABASE_URL = `postgres://${LOCAL_PG_USER}:${LOCAL_PG_PASSWORD}@localhost:${LOCAL_PG_PORT}/${LOCAL_PG_DATABASE}`;

const DATA_DIR = join(__dirname, "..", ".pgdata");

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: LOCAL_PG_PORT,
    user: LOCAL_PG_USER,
    password: LOCAL_PG_PASSWORD,
    persistent: true,
    // Windows' initdb otherwise defaults to the system codepage (e.g.
    // WIN1252), which then rejects any non-Latin-1 character (emoji,
    // curly quotes, accented names, etc.) on insert.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });

  if (!existsSync(DATA_DIR)) {
    console.log("initialising local postgres cluster...");
    await pg.initialise();
  }

  await pg.start();
  console.log("postgres started");

  try {
    await pg.createDatabase(LOCAL_PG_DATABASE);
    console.log(`created database ${LOCAL_PG_DATABASE}`);
  } catch {
    // already exists
  }

  console.log(`DATABASE_URL=${LOCAL_DATABASE_URL}`);
  console.log("ready");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
