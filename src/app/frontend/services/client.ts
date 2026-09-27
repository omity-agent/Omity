import type { Control, Settings } from "../../../types";
import {
  activatedFileResponseSchema,
  bootstrapResponseSchema,
  cleanupResponseSchema,
  controlResponseSchema,
  deletedResponseSchema,
  draftResponseSchema,
  messageResponseSchema,
  predictionsResponseSchema,
  reasoningTranslationResponseSchema,
  revisionResponseSchema,
  sessionResponseSchema,
  toolCallResponseSchema,
  transcriptResponseSchema,
  userMessagesResponseSchema,
  workspaceResponseSchema,
} from "./validation/responses";
import { api, request } from "./httpTransport";
import type { FileLinkAction } from "../../../fileLinks/types";
import type { InitialSessionState } from "../../initialState";
import type { PendingAttachment } from "../../attachments/contract";
import type { ReasoningTranslation } from "../../timeline";
import { submissionForm } from "../../attachments/submission";

export type { SessionInfo } from "../../sessionState";
const sessions = api.sessions[":sessionId"];
export type FrontendSettings = Settings["frontend"];
export async function bootstrap(signal?: AbortSignal) {
  return request(api.bootstrap.$get({}, { init: { signal } }), bootstrapResponseSchema, signal);
}
export async function loadUserMessages(signal?: AbortSignal) {
  return request(
    api["user-messages"].$get({}, { init: { signal } }),
    userMessagesResponseSchema,
    signal,
  );
}
export async function createSession(
  workspace: string,
  profile: string | undefined,
  initialState: InitialSessionState,
  attachments: PendingAttachment[],
) {
  return request(
    api.sessions.$post(
      {},
      { init: { body: submissionForm({ ...initialState, profile, workspace }, attachments) } },
    ),
    sessionResponseSchema,
  );
}
export async function deleteSession(sessionId: string) {
  return request(sessions.$delete(sessionRequest(sessionId)), deletedResponseSchema);
}
export async function clearTemporaryFiles(sessionId: string) {
  return request(
    sessions["temporary-files"].$delete(sessionRequest(sessionId)),
    cleanupResponseSchema,
  );
}
export async function pickWorkspacePath() {
  const result = await request(api["workspace-picker"].$post(), workspaceResponseSchema);
  return result.workspace;
}
export async function loadTranscript(sessionId: string, signal?: AbortSignal) {
  return request(
    sessions.transcript.$get(sessionRequest(sessionId), { init: { signal } }),
    transcriptResponseSchema,
    signal,
  );
}
export async function loadPredictions(sessionId: string, signal?: AbortSignal) {
  return request(
    sessions.predictions.$get(sessionRequest(sessionId), { init: { signal } }),
    predictionsResponseSchema,
    signal,
  );
}
export async function activateFileLink(sessionId: string, path: string, action: FileLinkAction) {
  return request(
    sessions["file-links"].activate.$post({ ...sessionRequest(sessionId), json: { action, path } }),
    activatedFileResponseSchema,
  );
}
export function contentEvents(sessionId: string) {
  return new EventSource(`.${sessions.events.content.$path(sessionRequest(sessionId))}`);
}
export function stateEvents() {
  return new EventSource(`.${api.events.state.$path()}`);
}
export async function loadComposerDraft(sessionId: string) {
  return request(sessions["composer-draft"].$get(sessionRequest(sessionId)), draftResponseSchema);
}
export async function saveComposerDraft(sessionId: string, content: string, revision: number) {
  return request(
    sessions["composer-draft"].$put({ ...sessionRequest(sessionId), json: { content, revision } }),
    revisionResponseSchema,
  );
}
export async function saveReasoningTranslation(
  sessionId: string,
  translation: ReasoningTranslation,
) {
  return request(
    sessions["reasoning-translation"].$put({ ...sessionRequest(sessionId), json: translation }),
    reasoningTranslationResponseSchema,
  );
}
export function beaconComposerDraft(sessionId: string, content: string, revision: number) {
  const body = new Blob([JSON.stringify({ content, revision })], {
    type: "application/json",
  });
  return navigator.sendBeacon(
    `.${sessions["composer-draft"].$path(sessionRequest(sessionId))}`,
    body,
  );
}
export async function sendMessage(
  sessionId: string,
  content: string,
  draftRevision: number,
  submissionId: string,
  attachments: PendingAttachment[],
) {
  return request(
    sessions.messages.$post(sessionRequest(sessionId), {
      init: { body: submissionForm({ content, draftRevision, submissionId }, attachments) },
    }),
    messageResponseSchema,
  );
}
export async function setControl(
  sessionId: string,
  control: Extract<Control, "running" | "step" | "pause" | "cancel">,
) {
  return request(
    sessions.control.$post({ ...sessionRequest(sessionId), json: { control } }),
    controlResponseSchema,
  );
}
export async function cancelTool(sessionId: string, toolCallId: string) {
  return request(
    sessions.tools.cancel.$post({ ...sessionRequest(sessionId), json: { toolCallId } }),
    toolCallResponseSchema,
  );
}
export async function answerTool(sessionId: string, toolCallId: string, answer: unknown) {
  return request(
    sessions.tools.answer.$post({ ...sessionRequest(sessionId), json: { answer, toolCallId } }),
    toolCallResponseSchema,
  );
}
export async function materializeFork(sessionId: string, beforeMessageId: number) {
  return request(
    sessions.fork.materialize.$post({ ...sessionRequest(sessionId), json: { beforeMessageId } }),
    sessionResponseSchema,
  );
}
function sessionRequest(sessionId: string) {
  return { param: { sessionId: encodeURIComponent(sessionId) } };
}
