import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "./client";

async function main() {
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");
  const pool = getPool();
  await pool.query(sql);
  console.log("schema applied");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
