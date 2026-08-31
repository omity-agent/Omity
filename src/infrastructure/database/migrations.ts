import type { SQLiteBunDatabase } from "drizzle-orm/bun-sqlite";
import { applicationAssetPath } from "../applicationAssets";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readFileSync } from "node:fs";

type MigrationDatabase = "access" | "session";
const migrationTables = {
  access: "__drizzle_access_migrations",
  session: "__drizzle_session_migrations",
} satisfies Record<MigrationDatabase, string>;
export function migrateSessionDatabase(db: SQLiteBunDatabase, root = process.cwd()) {
  migrateDatabase(db, "session", root);
}
export function migrateAccessDatabase(db: SQLiteBunDatabase, root = process.cwd()) {
  migrateDatabase(db, "access", root);
}
function migrateDatabase(db: SQLiteBunDatabase, database: MigrationDatabase, root: string) {
  const sql = readFileSync(migrationFile(root, database), "utf8"),
    name = createHash("sha256").update(sql).digest("hex");
  migrate(db, {
    migrationsJournal: [{ name, sql, timestamp: 0 }],
    migrationsTable: migrationTables[database],
  });
}
function migrationFile(root: string, database: MigrationDatabase) {
  const embeddedPath = join("migrations", database, "migration.sql");
  return applicationAssetPath(root, join("dist", embeddedPath), embeddedPath);
}
