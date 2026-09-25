import { type InitialMessagePair, initialHistory } from "../initialState";
import {
  type SessionDefinition,
  emptySessionDefinition,
} from "../../infrastructure/database/session/sessionDefinition";
import {
  databasePath,
  resolveSessionPaths,
  sessionPaths,
} from "../../infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../../infrastructure/database/agentDatabase";
import { HumanMessage } from "@langchain/core/messages";
import { UserMessageStorage } from "../../infrastructure/database/session/userMessages";
import { contentToText } from "../../runtime/content";
import { existsSync } from "node:fs";
import { forkDatabaseBeforeMessage } from "../fork";
import { initializeConversation } from "../../infrastructure/database/session/initialConversation";
import { openStoredSession } from "../../storedSessions";
import { removeDatabaseDirectory } from "../../infrastructure/database/sqlite/connection";

export function createSessionStorage(
  sessionId: string,
  workspace: string,
  profiles: string[],
  history: InitialMessagePair[],
  message: string,
  definition: SessionDefinition = emptySessionDefinition(),
) {
  const paths = sessionPaths(sessionId);
  let initialized = false;
  try {
    using db = new AgentDatabase(paths.dbPath);
    db.createSession(sessionId, workspace, profiles, definition);
    initializeConversation(db.db, sessionId, initialHistory(history), message);
    new UserMessageStorage(paths.userMessagesDir).writeAll([
      ...history.map(({ user }) => user),
      message,
    ]);
    initialized = true;
  } finally {
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
  const targetPaths = sessionPaths(targetSessionId);
  let created = false;
  try {
    using source = openStoredSession(sourceSessionId),
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
    new UserMessageStorage(targetPaths.userMessagesDir).writeAll(
      target
        .history(targetSessionId)
        .filter((message) => HumanMessage.isInstance(message))
        .map((message) => contentToText(message.content)),
    );
    created = true;
  } finally {
    if (!created) {
      removeDatabaseDirectory(targetPaths.dir);
    }
  }
}
export function removeSessionStorage(sessionId: string) {
  const paths = resolveSessionPaths(sessionId);
  if (existsSync(paths.dbPath)) {
    using db = new AgentDatabase(databasePath());
    if (db.hasSession(sessionId)) {
      db.deleteSession(sessionId);
    }
  }
  removeDatabaseDirectory(paths.dir);
}
