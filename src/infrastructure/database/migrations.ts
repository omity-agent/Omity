import type { AnyRelations } from "drizzle-orm/relations";
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

export function migrateSessionDatabase<
  TSchema extends Record<string, unknown>,
  TRelations extends AnyRelations,
>(db: SQLiteBunDatabase<TSchema, TRelations>, root = process.cwd()) {
  migrateDatabase(db, "session", root);
}
export function migrateAccessDatabase<
  TSchema extends Record<string, unknown>,
  TRelations extends AnyRelations,
>(db: SQLiteBunDatabase<TSchema, TRelations>, root = process.cwd()) {
  migrateDatabase(db, "access", root);
}
function migrateDatabase<TSchema extends Record<string, unknown>, TRelations extends AnyRelations>(
  db: SQLiteBunDatabase<TSchema, TRelations>,
  database: MigrationDatabase,
  root: string,
) {
  const sql = readFileSync(migrationFile(root, database), "utf8"),
    name = createHash("sha256").update(sql).digest("hex");
  migrate(db, {
    migrationsJournal: [{ name, sql, timestamp: 0 }],
    migrationsTable: migrationTables[database],
  });
}
function migrationFile(root: string, database: MigrationDatabase) {
  const source = join("src", "infrastructure", "database", "migrations", database, "migration.sql");
  return applicationAssetPath(root, source, join("migrations", database, "migration.sql"));
}
