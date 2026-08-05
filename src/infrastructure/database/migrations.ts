import { join, resolve } from "node:path";
import type { AnyRelations } from "drizzle-orm/relations";
import type { SQLiteBunDatabase } from "drizzle-orm/bun-sqlite";
import { applicationAssetPath } from "../applicationAssets";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

export function migrateSessionDatabase<
  TSchema extends Record<string, unknown>,
  TRelations extends AnyRelations,
>(db: SQLiteBunDatabase<TSchema, TRelations>, root = process.cwd()) {
  migrate(db, {
    migrationsFolder: migrationDirectory(root, "session"),
    migrationsTable: "__drizzle_session_migrations",
  });
}
export function migrateAccessDatabase<
  TSchema extends Record<string, unknown>,
  TRelations extends AnyRelations,
>(db: SQLiteBunDatabase<TSchema, TRelations>, root = process.cwd()) {
  migrate(db, {
    migrationsFolder: migrationDirectory(root, "access"),
    migrationsTable: "__drizzle_access_migrations",
  });
}
function migrationDirectory(root: string, database: "access" | "session") {
  const source = resolve("src", "infrastructure", "database", "migrations", database);
  return applicationAssetPath(root, source, join("migrations", database));
}
