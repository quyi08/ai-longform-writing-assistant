import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");

export async function applyMigrations(client, migrations) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const { rows } = await client.query("SELECT id FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.id));

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

async function loadMigrations() {
  const entries = await readdir(migrationDirectory);
  return Promise.all(
    entries
      .filter((entry) => entry.endsWith(".sql"))
      .sort()
      .map(async (fileName) => ({
        id: fileName.replace(/\.sql$/, ""),
        sql: await readFile(path.join(migrationDirectory, fileName), "utf8"),
      })),
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await applyMigrations(client, await loadMigrations());
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
