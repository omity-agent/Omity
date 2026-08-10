import { type InitialMessagePair, initialHistory } from "../initialState";
import { resolveSessionPaths, sessionPaths } from "../../infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../../infrastructure/database/agentDatabase";
import { forkDatabaseBeforeMessage } from "../fork";
import { initializeConversation } from "../../infrastructure/database/initialConversation";
import { removeDatabaseDirectory } from "../../infrastructure/database/connection";

export function createSessionStorage(
  sessionId: string,
  workspace: string,
  profiles: string[],
  history: InitialMessagePair[],
  message: string,
) {
  const paths = sessionPaths(sessionId),
    db = new AgentDatabase(paths.dbPath);
  let initialized = false;
  try {
    db.createSession(sessionId, workspace, profiles);
    initializeConversation(db.db, sessionId, initialHistory(history), message);
    initialized = true;
  } finally {
    db.close();
    if (!initialized) {
      removeDatabaseDirectory(paths.dir);
    }
  }
}
export function forkSessionStorage({
  sourceSessionId,
  targetSessionId,
  workspace,
  profiles,
  beforeMessageId,
}: {
  sourceSessionId: string;
  targetSessionId: string;
  workspace: string;
  profiles: string[];
  beforeMessageId: number;
}) {
  const sourcePaths = resolveSessionPaths(sourceSessionId),
    targetPaths = sessionPaths(targetSessionId);
  let created = false,
    source: AgentDatabase | undefined,
    target: AgentDatabase | undefined;
  try {
    source = new AgentDatabase(sourcePaths.dbPath);
    target = new AgentDatabase(targetPaths.dbPath);
    forkDatabaseBeforeMessage({
      beforeMessageId,
      profiles,
      source,
      sourceSessionId,
      target,
      targetSessionId,
      workspace,
    });
    created = true;
  } finally {
    try {
      try {
        target?.close();
      } finally {
        source?.close();
      }
    } finally {
      if (!created) {
        removeDatabaseDirectory(targetPaths.dir);
      }
    }
  }
}
export function removeSessionStorage(sessionId: string) {
  removeDatabaseDirectory(resolveSessionPaths(sessionId).dir);
}
