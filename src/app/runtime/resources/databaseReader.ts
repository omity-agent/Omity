import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

import { localize } from "../../../i18n/server";
import { databasePath } from "../../../infrastructure/configuration/sessionPaths";
import {
  closeDatabase,
  configureReadonlyDatabase,
} from "../../../infrastructure/database/sqlite/connection";

export class DatabaseReader implements Disposable {
  private database?: Database;
  private closed = false;
  constructor(private readonly path = databasePath()) {}
  open() {
    if (this.closed) {
      throw new Error(localize("application:resources.databaseReaderClosed"));
    }
    if (!this.database && existsSync(this.path)) {
      const db = new Database(this.path, { readonly: true, strict: true });
      try {
        configureReadonlyDatabase(db);
      } catch (error) {
        closeDatabase(db);
        throw error;
      }
      this.database = db;
    }
    return this.database;
  }
  close() {
    if (this.database) {
      closeDatabase(this.database);
      this.database = undefined;
    }
    this.closed = true;
  }
  [Symbol.dispose]() {
    this.close();
  }
}
