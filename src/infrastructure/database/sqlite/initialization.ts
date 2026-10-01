import type { Database } from "bun:sqlite";
import { applicationAssetPath } from "../../applicationAssets";
import { join } from "node:path";
import { readFileSync } from "node:fs";

export function initializeDatabase(db: Database, root = process.cwd()) {
  const execute = Reflect.get(db, "exec");
  if (typeof execute !== "function") {
    throw new Error("SQLite 数据库不支持初始化脚本执行");
  }
  execute.call(db, readFileSync(schemaAssetPath(root), "utf8"));
}
function schemaAssetPath(root: string) {
  return applicationAssetPath(root, join("dist", "database", "schema.sql"), "database/schema.sql");
}
