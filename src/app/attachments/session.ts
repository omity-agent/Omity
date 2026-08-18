import { createSessionStorage, removeSessionStorage } from "../runtime/sessionStorage";
import type { InitialMessagePair } from "../initialState";
import type { PendingAttachment } from "./contract";
import type { SessionDefinition } from "../../infrastructure/database/sessionDefinition";
import type { Settings } from "../../types";
import { saveMessageAttachments } from "./storage";

export async function createSessionWithAttachments(options: {
  settings: Settings;
  sessionId: string;
  workspace: string;
  profiles: string[];
  definition: SessionDefinition;
  history: InitialMessagePair[];
  message: string;
  attachments: PendingAttachment[];
}) {
  const saved = await saveMessageAttachments(
    options.settings,
    options.sessionId,
    options.message,
    options.attachments,
  );
  try {
    createSessionStorage(
      options.sessionId,
      options.workspace,
      options.profiles,
      options.history,
      saved.content,
      options.definition,
    );
  } catch (error) {
    await saved.discard();
    removeSessionStorage(options.sessionId);
    throw error;
  }
}
