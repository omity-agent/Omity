import { type ErrorDetails, parseError } from "../failures/details";
import {
  closeDatabase,
  configureReadonlyDatabase,
  queryGet,
} from "../infrastructure/database/connection";
import { existsSync, readdirSync } from "node:fs";
import type { Control } from "../types";
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";
import { sessionNotFound } from "../errors";
import { settingsProfileNamesSchema } from "../infrastructure/configuration/settings/context";
import { userDataDirectory } from "../infrastructure/configuration/settings/files";

export interface RegisteredSession {
  id: string;
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
      SELECT 1 FROM queue q
      WHERE q.session_id = s.id AND q.status = 'running'
    ) AS queue_running,
    EXISTS(
      SELECT 1 FROM queue q
      WHERE q.session_id = s.id AND q.status = 'paused'
    ) AS paused,
    (
      SELECT q.error FROM queue q
      WHERE q.session_id = s.id AND q.status = 'paused'
        AND q.error IS NOT NULL
      ORDER BY q.id DESC LIMIT 1
    ) AS error
  FROM sessions s`;
export class AppRegistry {
  private readonly sessionsDir: string;
  private readonly sessions = new Map<string, RegisteredSession>();
  constructor() {
    this.sessionsDir = resolve(userDataDirectory(), "sessions");
    for (const session of scanSessions(this.sessionsDir)) {
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
    const session = readSession(resolveSessionPaths(id).dbPath, id, false);
    this.sessions.set(id, session);
    return session;
  }
  remove(id: string) {
    if (!this.sessions.delete(id)) {
      throw sessionNotFound(id);
    }
  }
}
function scanSessions(sessionsDir: string) {
  if (!existsSync(sessionsDir)) {
    return [];
  }
  return readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readSession(resolveSessionPaths(entry.name).dbPath, undefined, true));
}
function compareSessions(left: RegisteredSession, right: RegisteredSession) {
  return right.updatedAt - left.updatedAt || right.createdAt - left.createdAt;
}
function readSession(dbPath: string, id?: string, _validate = false) {
  if (!existsSync(dbPath)) {
    throw sessionNotFound(id ?? dbPath);
  }
  const db = new Database(dbPath, {
    create: false,
    readonly: true,
    strict: true,
  });
  try {
    configureReadonlyDatabase(db);
    const row = id
      ? queryGet<SessionRow>(db, `${sessionSelect} WHERE s.id = ?`, id)
      : queryGet<SessionRow>(db, `${sessionSelect} LIMIT 1`);
    if (!row) {
      throw sessionNotFound(id ?? dbPath);
    }
    return toSession(row);
  } finally {
    closeDatabase(db);
  }
}
function toSession(row: SessionRow): RegisteredSession {
  return {
    control: row.control,
    createdAt: row.created_at,
    error: row.error ? parseError(row.error) : null,
    id: row.id,
    paused: row.paused === 1,
    profiles: settingsProfileNamesSchema.parse(JSON.parse(row.profiles_json) as unknown),
    queueRunning: row.queue_running === 1,
    updatedAt: row.updated_at,
    workspace: row.workspace,
  };
}
