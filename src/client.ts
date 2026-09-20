import type { Control } from "./types";
import { openStoredSession } from "./storedSessions";
import { requestStepControlRecord } from "./infrastructure/database/records/queue/control";

export function appendSessionMessage(sessionId: string, content: string) {
  using db = openStoredSession(sessionId);
  return { queueId: db.appendUser(sessionId, content) };
}
export function submitSessionMessage(
  sessionId: string,
  content: string,
  draftRevision: number,
  submissionId: string,
) {
  using db = openStoredSession(sessionId);
  return { queueId: db.submitUser(sessionId, content, draftRevision, submissionId) };
}
export function setSessionControl(sessionId: string, control: Control) {
  using db = openStoredSession(sessionId);
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
}
