/**
 * DB migration runner.
 *
 * Applies every `migrations/NNN_*.sql` file that hasn't been applied yet,
 * tracked in a `schema_migrations` table. Safe to run on every deploy — only
 * new files run. Add a new table/column by dropping a new numbered .sql file
 * into `migrations/`; it auto-applies on the next deploy. No manual server DB
 * access needed.
 *
 * Connection uses the same env as lib/db.ts (DB_HOST/DB_PORT/DB_USER/
 * DB_PASSWORD/DB_NAME; unix socket on Linux). Env is loaded from process.env,
 * falling back to .env.local then .env in the current working directory.
 */
import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(file, target) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in target)) target[key] = val;
  }
}

const cwd = process.cwd();
const env = { ...process.env };
loadEnvFile(path.join(cwd, ".env.local"), env);
loadEnvFile(path.join(cwd, ".env"), env);

const isWindows = process.platform === "win32";
const connectionConfig = {
  user: env.DB_USER || "root",
  password: env.DB_PASSWORD || "",
  database: env.DB_NAME || "interact_hrm",
  multipleStatements: true,
};
if (isWindows) {
  connectionConfig.host = env.DB_HOST || "localhost";
  connectionConfig.port = parseInt(env.DB_PORT || "3306");
} else {
  connectionConfig.socketPath = "/var/run/mysqld/mysqld.sock";
}

const MIGRATIONS_DIR = path.join(cwd, "migrations");

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

async function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    log("No migrations/ folder — nothing to do.");
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    log("No .sql migrations found.");
    return;
  }

  const conn = await mysql.createConnection(connectionConfig);
  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    const [rows] = await conn.query("SELECT filename FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.filename));

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        log(`skip (already applied): ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").trim();
      if (!sql) {
        log(`skip (empty): ${file}`);
        continue;
      }
      log(`applying: ${file}`);
      await conn.query(sql);
      await conn.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
      ran++;
      log(`done: ${file}`);
    }

    log(ran === 0 ? "All migrations already applied." : `Applied ${ran} new migration(s).`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`[migrate] FAILED: ${err.message}`);
  process.exit(1);
});
