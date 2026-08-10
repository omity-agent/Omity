import { forkSessionStorage, removeSessionStorage } from "./sessionStorage";
import type { SessionSubmission } from "../attachments/contract";
import type { Settings } from "../../types";
import { claimShortId } from "../../infrastructure/randomId";
import { createSessionWithAttachments } from "../attachments/session";
import { mkdirSync } from "node:fs";
import { normalizeWorkspacePath } from "../../infrastructure/configuration/workspacePath";
import { resolve } from "node:path";
import { userDataDirectory } from "../../infrastructure/configuration/settings/files";

export async function createAppSession(
  appRoot: string,
  submission: SessionSubmission,
  settings: Settings,
  profiles: string[],
) {
  const workspace = normalizeWorkspacePath(submission.workspace, appRoot),
    sessionId = reserveSessionId();
  try {
    await createSessionWithAttachments({
      attachments: submission.attachments,
      history: submission.history,
      message: submission.message,
      profiles,
      sessionId,
      settings,
      workspace,
    });
  } catch (error) {
    removeSessionStorage(sessionId);
    throw error;
  }
  return { sessionId, workspace };
}
export async function createAppFork(options: {
  beforeMessageId: number;
  pauseSource: () => Promise<unknown>;
  sourceSessionId: string;
  workspace: string;
  profiles: string[];
}) {
  const targetSessionId = reserveSessionId();
  let targetCreated = false;
  try {
    forkSessionStorage({
      beforeMessageId: options.beforeMessageId,
      profiles: options.profiles,
      sourceSessionId: options.sourceSessionId,
      targetSessionId,
      workspace: options.workspace,
    });
    targetCreated = true;
    await options.pauseSource();
  } catch (error) {
    if (targetCreated) {
      removeSessionStorage(targetSessionId);
    }
    throw error;
  }
  return targetSessionId;
}
function reserveSessionId() {
  const sessionsDir = resolve(userDataDirectory(), "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  return claimShortId((id) => {
    try {
      mkdirSync(resolve(sessionsDir, id));
      return true;
    } catch (error) {
      if (isExistsError(error)) {
        return false;
      }
      throw error;
    }
  });
}
function isExistsError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: unknown }).code === "EEXIST"
  );
}
