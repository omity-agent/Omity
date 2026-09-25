import { type ErrorDetails, parseError } from "../failures/details";
import {
  cachedQuery,
  configureReadonlyDatabase,
  queryAll,
  runTransaction,
} from "../infrastructure/database/sqlite/connection";
import { databasePath, resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";
import type { Control } from "../types";
import { Database } from "bun:sqlite";
import { deriveSessionTitle } from "../infrastructure/database/records/transcript/messages/deriveTitle";
import { existsSync } from "node:fs";
import { sessionNotFound } from "../errors";
import { settingsProfileNamesSchema } from "../infrastructure/configuration/settings/context";

export interface RegisteredSession {
  id: string;
  title: string;
  workspace: string;
  profiles: string[];
  createdAt: number;
  updatedAt: number;
  control: Control;
  paused: boolean;
  queueRunning: boolean;
  error: ErrorDetails | null;
}
interface SessionRow {
  id: string;
  workspace: string;
  profiles_json: string;
  created_at: number;
  updated_at: number;
  control: Control;
  paused: number;
  queue_running: number;
  error: string | null;
}
const sessionSelect = `
	  SELECT s.id, s.workspace, s.profiles_json, s.created_at,
    MAX(
      s.updated_at,
      COALESCE(
        (
          SELECT MAX(m.created_at) FROM messages m
          WHERE m.session_id = s.id AND m.position IS NOT NULL
        ),
        s.updated_at
      )
    ) AS updated_at,
    s.control,
    EXISTS(
      SELECT 1 FROM runs q
      WHERE q.session_id = s.id AND q.status = 'running'
    ) AS queue_running,
    EXISTS(
      SELECT 1 FROM runs q
      WHERE q.session_id = s.id AND q.status = 'paused'
    ) AS paused,
    (
      SELECT q.error_json FROM runs q
      WHERE q.session_id = s.id AND q.status = 'paused'
        AND q.error_json IS NOT NULL
      ORDER BY q.id DESC LIMIT 1
    ) AS error
  FROM sessions s`;
export class AppRegistry {
  private readonly sessions = new Map<string, RegisteredSession>();
  constructor() {
    for (const session of readSessions(databasePath())) {
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
  refresh(id: string, db?: Database) {
    const session = db
      ? readSessionRecord(db, id)
      : readSession(resolveSessionPaths(id).dbPath, id);
    this.sessions.set(id, session);
    return session;
  }
  remove(id: string) {
    if (!this.sessions.delete(id)) {
      throw sessionNotFound(id);
    }
  }
}
function readSessions(dbPath: string) {
  if (!existsSync(dbPath)) {
    return [];
  }
  using db = new Database(dbPath, { create: false, readonly: true, strict: true });
  configureReadonlyDatabase(db);
  return queryAll<SessionRow>(db, sessionSelect)
    .filter((row) => existsSync(resolveSessionPaths(row.id).dir))
    .map((row) => toSession(row, deriveSessionTitle(db, row.id)));
}
function compareSessions(left: RegisteredSession, right: RegisteredSession) {
  return right.updatedAt - left.updatedAt || right.createdAt - left.createdAt;
}
function readSession(dbPath: string, id?: string) {
  if (!existsSync(dbPath)) {
    throw sessionNotFound(id ?? dbPath);
  }
  using db = new Database(dbPath, {
    create: false,
    readonly: true,
    strict: true,
  });
  configureReadonlyDatabase(db);
  return readSessionRecord(db, id);
}
function readSessionRecord(db: Database, id?: string) {
  return runTransaction(db, () => {
    const row = id
      ? cachedQuery<SessionRow>(db, `${sessionSelect} WHERE s.id = ?`).get(id)
      : cachedQuery<SessionRow>(db, `${sessionSelect} LIMIT 1`).get();
    if (!row) {
      throw sessionNotFound(id ?? db.filename);
    }
    return toSession(row, deriveSessionTitle(db, row.id));
  });
}
function toSession(row: SessionRow, title: string): RegisteredSession {
  return {
    control: row.control,
    createdAt: row.created_at,
    error: row.error ? parseError(row.error) : null,
    id: row.id,
    paused: row.paused === 1,
    profiles: settingsProfileNamesSchema.parse(JSON.parse(row.profiles_json) as unknown),
    queueRunning: row.queue_running === 1,
    title,
    updatedAt: row.updated_at,
    workspace: row.workspace,
  };
}
