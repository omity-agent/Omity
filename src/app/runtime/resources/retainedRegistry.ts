import {
  closeDatabase,
  configureReadonlyDatabase,
} from "../../../infrastructure/database/connection";
import { AppRegistry } from "../../registry";
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolveSessionPaths } from "../../../infrastructure/configuration/sessionPaths";
import { sessionNotFound } from "../../../errors";
import { streamEventCursor } from "../../../infrastructure/database/records/streamEvents";

export class RetainedRegistry extends AppRegistry {
  private readonly readers = new Map<string, Database>();
  override refresh(id: string) {
    return super.refresh(id, this.reader(id));
  }
  eventCursor(id: string) {
    this.require(id);
    return streamEventCursor(this.reader(id));
  }
  release(id: string) {
    const db = this.readers.get(id);
    if (db) {
      closeDatabase(db);
      this.readers.delete(id);
    }
  }
  close() {
    for (const id of this.readers.keys()) {
      this.release(id);
    }
  }
  private reader(id: string) {
    const existing = this.readers.get(id);
    if (existing) {
      return existing;
    }
    const { dbPath } = resolveSessionPaths(id);
    if (!existsSync(dbPath)) {
      throw sessionNotFound(id);
    }
    const db = new Database(dbPath, { readonly: true, strict: true });
    try {
      configureReadonlyDatabase(db);
    } catch (error) {
      closeDatabase(db);
      throw error;
    }
    this.readers.set(id, db);
    return db;
  }
}
