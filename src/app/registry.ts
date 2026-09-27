import type { Database } from "bun:sqlite";
import { DatabaseReader } from "./runtime/resources/databaseReader";
import { deriveSessionTitle } from "../infrastructure/database/records/transcript/messages/deriveTitle";
import { existsSync } from "node:fs";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";
import { runTransaction } from "../infrastructure/database/sqlite/connection";
import { sessionNotFound } from "../errors";
import { sessionOverviewRows } from "../infrastructure/database/projections/sessionOverview";
import { streamEventCursor } from "../infrastructure/database/records/transcript/streamEvents";

type SessionOverview = ReturnType<typeof sessionOverviewRows>[number];
export type RegisteredSession = SessionOverview & {
  title: string;
};
export class AppRegistry implements Disposable {
  private readonly sessions = new Map<string, RegisteredSession>();
  private readonly reader = new DatabaseReader();
  constructor() {
    try {
      this.reload();
    } catch (error) {
      this.close();
      throw error;
    }
  }
  reload() {
    const db = this.reader.open(),
      sessions = db
        ? runTransaction(db, () =>
            sessionOverviewRows(db)
              .filter((row) => existsSync(resolveSessionPaths(row.id).dir))
              .map((row) => toSession(db, row)),
          )
        : [];
    this.sessions.clear();
    for (const session of sessions) {
      this.sessions.set(session.id, session);
    }
  }
  list() {
    return [...this.sessions.values()].toSorted(compareSessions);
  }
  require(id: string) {
    const session = this.sessions.get(id);
    if (!session) {
      throw sessionNotFound(id);
    }
    return session;
  }
  refresh(id: string) {
    const db = this.requireDatabase(id),
      session = runTransaction(db, () => {
        const [row] = sessionOverviewRows(db, id);
        if (!row) {
          throw sessionNotFound(id);
        }
        return toSession(db, row);
      });
    this.sessions.set(id, session);
    return session;
  }
  read<T>(id: string, operation: (db: Database) => T): T {
    this.require(id);
    return operation(this.requireDatabase(id));
  }
  eventCursor(id: string) {
    return this.read(id, streamEventCursor);
  }
  remove(id: string) {
    if (!this.sessions.delete(id)) {
      throw sessionNotFound(id);
    }
  }
  close() {
    this.reader.close();
  }
  [Symbol.dispose]() {
    this.close();
  }
  private requireDatabase(id: string) {
    const db = this.reader.open();
    if (!db) {
      throw sessionNotFound(id);
    }
    return db;
  }
}
function compareSessions(left: RegisteredSession, right: RegisteredSession) {
  return right.updatedAt - left.updatedAt || right.createdAt - left.createdAt;
}
function toSession(db: Database, row: SessionOverview): RegisteredSession {
  return { ...row, title: deriveSessionTitle(db, row.id) };
}
