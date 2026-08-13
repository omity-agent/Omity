import type { PendingAttachment } from "./contract";
import type { Settings } from "../../types";
import { saveMessageAttachments } from "./storage";
import { submitSessionMessage } from "../../client";

export async function enqueueMessageWithAttachments(
  settings: Settings,
  sessionId: string,
  content: string,
  draftRevision: number,
  submissionId: string,
  attachments: PendingAttachment[],
  ensureHost: () => Promise<void>,
) {
  const saved = await saveMessageAttachments(settings, sessionId, content, attachments);
  try {
    await ensureHost();
    const result = submitSessionMessage(sessionId, saved.content, draftRevision, submissionId);
    return { ...result, content: saved.content };
  } catch (error) {
    await saved.discard();
    throw error;
  }
}
