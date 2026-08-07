import { AgentDatabase } from "./infrastructure/database/agentDatabase";
import type { Control } from "./types";
import { existsSync } from "node:fs";
import { requestStepControlRecord } from "./infrastructure/database/records/queue/control";
import { resolveSessionPaths } from "./infrastructure/configuration/sessionPaths";
import { sessionNotFound } from "./errors";

type ClientControl = Control;
export function appendSessionMessage(sessionId: string, content: string) {
  return withSessionDatabase(sessionId, (db) => ({
    queueId: db.appendUser(sessionId, content),
  }));
}
export function setSessionControl(sessionId: string, control: ClientControl) {
  return withSessionDatabase(sessionId, (db) => {
    if (control === "step") {
      requestStepControlRecord(db.db, sessionId);
      return { control };
    }
    const stored =
      control === "cancel" &&
      (db.control(sessionId) === "pause" || db.control(sessionId) === "pause_cancel")
        ? "pause_cancel"
        : control;
    db.setControl(sessionId, stored);
    return { control };
  });
}
function withSessionDatabase<T>(sessionId: string, operation: (db: AgentDatabase) => T) {
  const paths = resolveSessionPaths(sessionId);
  if (!existsSync(paths.dbPath)) {
    throw sessionNotFound(sessionId);
  }
  const db = new AgentDatabase(paths.dbPath);
  try {
    if (!db.hasSession(sessionId)) {
      throw sessionNotFound(sessionId);
    }
    return operation(db);
  } finally {
    db.close();
  }
}
