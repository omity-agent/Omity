import { type PendingAttachment, appendAttachments } from "../../attachments/contract";
import {
  answerResponseSchema,
  bootstrapResponseSchema,
  cancellationResponseSchema,
  controlResponseSchema,
  deletedResponseSchema,
  draftResponseSchema,
  messageResponseSchema,
  reasoningTranslationResponseSchema,
  revisionResponseSchema,
  sessionResponseSchema,
  transcriptResponseSchema,
  workspaceResponseSchema,
} from "./validation/responses";
import type { Control } from "../../../types";
import type { FileLinkAction } from "../../../fileLinks/types";
import type { InitialSessionState } from "../../initialState";
import { request } from "./request";
import { z } from "./validation";

export { ApiError } from "./request";
export type { SessionInfo } from "../../sessionState";
const fileLinkActionSchema = z.object({ path: z.string() });
export interface FrontendSettings {
  draftSaveDelayMs: number;
  reasoningTranslation: {
    enabled: boolean;
    minimumIntervalMs: number;
  };
  transcriptRefreshIntervalMs: number;
}
export async function bootstrap(signal?: AbortSignal) {
  return request("api/bootstrap", bootstrapResponseSchema, { signal });
}
export async function createSession(
  workspace: string,
  profile: string | undefined,
  initialState: InitialSessionState,
  attachments: PendingAttachment[],
) {
  const body = new FormData();
  body.set("workspace", workspace);
  if (profile !== undefined) {
    body.set("profile", profile);
  }
  body.set("history", JSON.stringify(initialState.history));
  body.set("message", initialState.message);
  appendAttachments(body, attachments);
  return request("api/sessions", sessionResponseSchema, {
    body,
    method: "POST",
  });
}
export async function deleteSession(sessionId: string) {
  return request(`api/sessions/${encodeURIComponent(sessionId)}`, deletedResponseSchema, {
    method: "DELETE",
  });
}
export async function pickWorkspace() {
  return request("api/workspace-picker", workspaceResponseSchema, {
    method: "POST",
  });
}
export async function pickWorkspacePath() {
  const result = await pickWorkspace();
  return result.workspace;
}
export async function loadTranscript(sessionId: string, signal?: AbortSignal) {
  return request(
    `api/sessions/${encodeURIComponent(sessionId)}/transcript`,
    transcriptResponseSchema,
    { signal },
  );
}
export async function activateFileLink(sessionId: string, path: string, action: FileLinkAction) {
  return request(
    `api/sessions/${encodeURIComponent(sessionId)}/file-links/activate`,
    fileLinkActionSchema,
    {
      body: JSON.stringify({ action, path }),
      method: "POST",
    },
  );
}
export function contentEvents(sessionId: string) {
  return eventSource(`api/sessions/${encodeURIComponent(sessionId)}/events/content`);
}
export function stateEvents() {
  return eventSource("api/events/state");
}
export async function loadComposerDraft(sessionId: string) {
  return request(
    `api/sessions/${encodeURIComponent(sessionId)}/composer-draft`,
    draftResponseSchema,
  );
}
export async function saveComposerDraft(sessionId: string, content: string, revision: number) {
  return request(
    `api/sessions/${encodeURIComponent(sessionId)}/composer-draft`,
    revisionResponseSchema,
    {
      body: JSON.stringify({ content, revision }),
      method: "PUT",
    },
  );
}
export async function saveReasoningTranslation(
  sessionId: string,
  translation: {
    messageId: string;
    source: string;
    targetLanguage: string;
    translated: string;
  },
) {
  return request(
    `api/sessions/${encodeURIComponent(sessionId)}/reasoning-translation`,
    reasoningTranslationResponseSchema,
    {
      body: JSON.stringify(translation),
      method: "PUT",
    },
  );
}
export function beaconComposerDraft(sessionId: string, content: string, revision: number) {
  const body = new Blob([JSON.stringify({ content, revision })], {
    type: "application/json",
  });
  return navigator.sendBeacon(`api/sessions/${encodeURIComponent(sessionId)}/composer-draft`, body);
}
export async function sendMessage(
  sessionId: string,
  content: string,
  draftRevision: number,
  attachments: PendingAttachment[],
) {
  const body = new FormData();
  body.set("content", content);
  body.set("draftRevision", draftRevision.toString());
  appendAttachments(body, attachments);
  return request(`api/sessions/${encodeURIComponent(sessionId)}/messages`, messageResponseSchema, {
    body,
    method: "POST",
  });
}
export async function setControl(
  sessionId: string,
  control: Extract<Control, "running" | "step" | "pause" | "cancel">,
) {
  return request(`api/sessions/${encodeURIComponent(sessionId)}/control`, controlResponseSchema, {
    body: JSON.stringify({ control }),
    method: "POST",
  });
}
export async function cancelTool(sessionId: string, toolCallId: string) {
  return request(
    `api/sessions/${encodeURIComponent(sessionId)}/tools/cancel`,
    cancellationResponseSchema,
    {
      body: JSON.stringify({ toolCallId }),
      method: "POST",
    },
  );
}
export async function answerTool(sessionId: string, toolCallId: string, answer: unknown) {
  return request(
    `api/sessions/${encodeURIComponent(sessionId)}/tools/answer`,
    answerResponseSchema,
    {
      body: JSON.stringify({ answer, toolCallId }),
      method: "POST",
    },
  );
}
export async function forkSession(sessionId: string, beforeMessageId: number) {
  return request(`api/sessions/${encodeURIComponent(sessionId)}/fork`, sessionResponseSchema, {
    body: JSON.stringify({ beforeMessageId }),
    method: "POST",
  });
}
function eventSource(path: string) {
  return new EventSource(path);
}
