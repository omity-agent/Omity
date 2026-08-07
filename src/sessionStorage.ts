import { AgentDatabase } from "./infrastructure/database/agentDatabase";
import { existsSync } from "node:fs";
import { removeDatabaseDirectory } from "./infrastructure/database/connection";
import { resolveSessionPaths } from "./infrastructure/configuration/sessionPaths";
import { sessionNotFound } from "./errors";

export function deleteHostSession(sessionId: string) {
  const paths = resolveSessionPaths(sessionId);
  if (!existsSync(paths.dir)) {
    throw sessionNotFound(sessionId);
  }
  removeDatabaseDirectory(paths.dir);
}
export function requestHostToolCancellation(sessionId: string, callId: string) {
  const paths = resolveSessionPaths(sessionId);
  if (!existsSync(paths.dbPath)) {
    throw sessionNotFound(sessionId);
  }
  const db = new AgentDatabase(paths.dbPath);
  try {
    if (!db.hasSession(sessionId)) {
      throw sessionNotFound(sessionId);
    }
    db.requestToolCancellation(sessionId, callId);
  } finally {
    db.close();
  }
}
