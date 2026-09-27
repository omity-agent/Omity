import type { Control, QueuedInput, RunStatus } from "../../types";
import { type SessionDefinition, emptySessionDefinition } from "./session/sessionDefinition";
import type { StreamEvent, StreamEventDraft } from "./schema/streamEvent";
import {
  closeDatabase,
  openSessionDatabase,
  reclaimDatabasePages,
  runTransaction,
} from "./sqlite/connection";
import {
  consumedInputRows,
  nextInputRow,
  pendingInputRows,
} from "./records/execution/queue/workItems";
import {
  createSessionRecord,
  hasSessionRecord,
  readControlRecord,
  readProfilesRecord,
  readTranscriptRevisionRecord,
  readWorkspaceRecord,
  requireSessionRecord,
  touchInputSessionRecord,
  touchSessionRecord,
  writeControlRecord,
} from "./records/session/metadata";
import {
  deleteInputStream,
  insertUserBoundaryEvent,
  streamEventCursor,
} from "./records/transcript/streamEvents";
import { deleteSessionStorage, resetSessionStorage } from "./maintenance";
import {
  readToolCancellation,
  requestToolCancellation,
} from "./records/execution/toolCancellations";
import { runStatusRecord, setRunStatusRecord } from "./records/execution/runs/mutations";
import type { BaseMessage } from "@langchain/core/messages";
import type { ErrorDetails } from "../../failures/details";
import { FileLinkIndexer } from "./indexing/linkScanner";
import { InputSubmissionStore } from "./records/execution/acceptance";
import { RecoverableDatabase } from "./records/execution/interruption";
import { appendFileLinkStream } from "./indexing/streamAppend";
import { consumeInputRecord } from "./records/execution/queue/admission";
import { deleteInputFileLinkUnits } from "./records/transcript/fileLinks";
import { loadMessages } from "./records/transcript/messages/history";
import { syncIndexedHistory } from "./indexing/historySync";

export class AgentDatabase extends RecoverableDatabase {
  private notify?: (event: StreamEvent) => void;
  private readonly fileLinks: FileLinkIndexer;
  private readonly queueSubmissions: InputSubmissionStore;
  private storageReclaimPending = false;
  constructor(path: string, root = process.cwd()) {
    super(openSessionDatabase(path, root));
    this.fileLinks = new FileLinkIndexer(this.db);
    this.queueSubmissions = new InputSubmissionStore(this.db);
  }
  close() {
    closeDatabase(this.db);
  }
  [Symbol.dispose]() {
    this.close();
  }
  onChange(notify: (event: StreamEvent) => void) {
    this.notify = notify;
  }
  resetSession(
    sessionId: string,
    workspace: string,
    profiles: readonly string[] = [],
    initialDefinition: SessionDefinition = emptySessionDefinition(),
  ) {
    resetSessionStorage(this.db, sessionId, workspace, profiles, initialDefinition);
  }
  deleteSession(sessionId: string) {
    deleteSessionStorage(this.db, sessionId);
  }
  requestStorageReclaim() {
    this.storageReclaimPending = true;
  }
  reclaimStorageIfPending() {
    if (!this.storageReclaimPending) {
      return true;
    }
    const reclaimed = reclaimDatabasePages(this.db);
    this.storageReclaimPending = !reclaimed;
    return reclaimed;
  }
  createSession(
    sessionId: string,
    workspace: string,
    profiles: readonly string[] = [],
    definition: SessionDefinition = emptySessionDefinition(),
    initialControl: Control = "running",
  ) {
    createSessionRecord(this.db, sessionId, workspace, profiles, definition, initialControl);
  }
  hasSession(sessionId: string) {
    return hasSessionRecord(this.db, sessionId);
  }
  workspace(sessionId: string) {
    return readWorkspaceRecord(this.db, sessionId);
  }
  profiles(sessionId: string) {
    return readProfilesRecord(this.db, sessionId);
  }
  appendUser(sessionId: string, content: string) {
    return this.queueSubmissions.appendUser(sessionId, content);
  }
  submitUser(sessionId: string, content: string, draftRevision: number, submissionId: string) {
    return this.queueSubmissions.submitUser(sessionId, content, draftRevision, submissionId);
  }
  pendingInputs(sessionId: string): QueuedInput[] {
    return pendingInputRows(this.db, sessionId);
  }
  consumedInputs(sessionId: string, runId: number): QueuedInput[] {
    return consumedInputRows(this.db, sessionId, runId);
  }
  nextInput(sessionId: string): QueuedInput | null {
    return nextInputRow(this.db, sessionId);
  }
  consumeInput(sessionId: string, item: QueuedInput) {
    const result = runTransaction(this.db, () => {
      const userMessageId = consumeInputRecord(this.db, sessionId, item),
        boundary = insertUserBoundaryEvent(this.db, sessionId, item.id);
      touchSessionRecord(this.db, sessionId);
      return { boundary, userMessageId };
    });
    if (result.boundary) {
      this.notify?.(result.boundary);
    }
    return result.userMessageId;
  }
  setRunStatus(runId: number, status: RunStatus, error?: ErrorDetails) {
    const discarded = runTransaction(this.db, () => {
      const result = setRunStatusRecord(this.db, runId, status, error);
      touchSessionRecord(this.db, result.sessionId);
      return result.discardedInputIds;
    });
    this.fileLinks.discardInputs(discarded);
  }
  runStatus(runId: number) {
    return runStatusRecord(this.db, runId);
  }
  eventCursor() {
    return streamEventCursor(this.db);
  }
  transcriptRevision(sessionId: string) {
    return readTranscriptRevisionRecord(this.db, sessionId);
  }
  async syncHistory(sessionId: string, messages: BaseMessage[]) {
    requireSessionRecord(this.db, sessionId);
    const finished = await syncIndexedHistory({
      db: this.db,
      fileLinks: this.fileLinks,
      messages,
      sessionId,
      workspace: this.workspace(sessionId),
    });
    for (const event of finished) {
      this.notify?.(event);
    }
  }
  history(sessionId: string): BaseMessage[] {
    requireSessionRecord(this.db, sessionId);
    return loadMessages(this.db, sessionId);
  }
  control(sessionId: string): Control {
    return readControlRecord(this.db, sessionId);
  }
  setControl(sessionId: string, control: Control) {
    writeControlRecord(this.db, sessionId, control);
  }
  requestToolCancellation(sessionId: string, callId: string) {
    requireSessionRecord(this.db, sessionId);
    requestToolCancellation(this.db, sessionId, callId);
  }
  toolCancellation(sessionId: string, callId: string) {
    return readToolCancellation(this.db, sessionId, callId);
  }
  appendStream(sessionId: string, event: StreamEventDraft) {
    return appendFileLinkStream({
      db: this.db,
      event,
      fileLinks: this.fileLinks,
      notify: this.notify,
      sessionId,
      workspace: this.workspace(sessionId),
    });
  }
  discardInputStream(inputId: number) {
    runTransaction(this.db, () => {
      touchInputSessionRecord(this.db, inputId);
      deleteInputStream(this.db, inputId);
      deleteInputFileLinkUnits(this.db, inputId);
    });
    this.fileLinks.discardInputs([inputId]);
  }
}
