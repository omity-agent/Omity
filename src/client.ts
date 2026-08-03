import { AgentDatabase } from "./infrastructure/database/agentDatabase";
import type { Control } from "./types";
import { existsSync } from "node:fs";
import { loadSettings } from "./infrastructure/configuration/settings/load";
import { resolveSessionPaths } from "./infrastructure/configuration/sessionPaths";
import { sessionNotFound } from "./errors";

type ClientControl = Control;
export function appendSessionMessage(sessionId: string, content: string, root = process.cwd()) {
  return withSessionDatabase(sessionId, root, (db) => ({
    queueId: db.appendUser(sessionId, content),
  }));
}
export function setSessionControl(sessionId: string, control: ClientControl, root = process.cwd()) {
  return withSessionDatabase(sessionId, root, (db) => {
    const stored =
      control === "cancel" &&
      (db.control(sessionId) === "pause" || db.control(sessionId) === "pause_cancel")
        ? "pause_cancel"
        : control;
    db.setControl(sessionId, stored);
    return { control };
  });
}
function withSessionDatabase<T>(
  sessionId: string,
  root: string,
  operation: (db: AgentDatabase) => T,
) {
  const settings = loadSettings(root);
  const paths = resolveSessionPaths(settings, sessionId);
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
