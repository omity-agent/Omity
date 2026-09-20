import { type InitialMessagePair, initialHistory } from "../initialState";
import {
  type SessionDefinition,
  emptySessionDefinition,
} from "../../infrastructure/database/sessionDefinition";
import { resolveSessionPaths, sessionPaths } from "../../infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../../infrastructure/database/agentDatabase";
import { HumanMessage } from "@langchain/core/messages";
import { UserMessageStorage } from "../../infrastructure/database/userMessages";
import { contentToText } from "../../runtime/content";
import { forkDatabaseBeforeMessage } from "../fork";
import { initializeConversation } from "../../infrastructure/database/initialConversation";
import { openStoredSession } from "../../storedSessions";
import { removeDatabaseDirectory } from "../../infrastructure/database/connection";

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
  removeDatabaseDirectory(resolveSessionPaths(sessionId).dir);
}
