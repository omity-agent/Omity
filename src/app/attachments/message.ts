import type { PendingAttachment } from "./contract";
import type { Settings } from "../../types";
import { appendSessionMessage } from "../../client";
import { saveMessageAttachments } from "./storage";

export async function enqueueMessageWithAttachments(
  settings: Settings,
  sessionId: string,
  content: string,
  attachments: PendingAttachment[],
  ensureHost: () => Promise<void>,
) {
  const saved = await saveMessageAttachments(settings, sessionId, content, attachments);
  try {
    await ensureHost();
    const result = appendSessionMessage(sessionId, saved.content);
    return { ...result, content: saved.content };
  } catch (error) {
    await saved.discard();
    throw error;
  }
}
