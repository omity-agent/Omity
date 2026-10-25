import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { localize } from "../../../i18n/server";
import { applicationAssetPath } from "../../applicationAssets";

export function initializeDatabase(db: Database, root = process.cwd()) {
  const execute = Reflect.get(db, "exec");
  if (typeof execute !== "function") {
    throw new Error(localize("database:sqlite.initializationScriptUnsupported"));
  }
  execute.call(db, readFileSync(schemaAssetPath(root), "utf8"));
}
function schemaAssetPath(root: string) {
  return applicationAssetPath(root, join("dist", "database", "schema.sql"), "database/schema.sql");
}
