import type { Control, QueueItem, QueueStatus } from "../../types";
import {
  type StreamEvent,
  type StreamEventDraft,
  deleteQueueStream,
  insertUserBoundaryEvent,
  streamEventCursor,
} from "./records/streamEvents";
import {
  closeDatabase,
  openSessionDatabase,
  reclaimDatabasePages,
  runTransaction,
} from "./connection";
import {
  consumedRunRows,
  nextQueueRow,
  pendingAppendRows,
  queueStatusRecord,
  setQueueStatusRecord,
  startQueueRecord,
} from "./records/queue/operations";
import {
  createSessionRecord,
  hasSessionRecord,
  readControlRecord,
  readProfilesRecord,
  readTranscriptRevisionRecord,
  readWorkspaceRecord,
  requireSessionRecord,
  touchQueueSessionRecord,
  touchSessionRecord,
  writeControlRecord,
} from "./records/sessions";
import { discardIndexedQueue, syncIndexedHistory } from "./fileLinkOperations";
import { requestToolCancellation, takeToolCancellation } from "./records/toolCancellations";
import type { BaseMessage } from "@langchain/core/messages";
import type { ErrorDetails } from "../../failures/details";
import { FileLinkIndexer } from "./fileLinkIndexer";
import { QueueSubmissionStore } from "./records/queue/submission";
import { RecoverableDatabase } from "./records/recovery";
import { appendFileLinkStream } from "./fileLinkAppend";
import { loadMessages } from "./records/messages/history";
import { resetSessionStorage } from "./maintenance";

export class AgentDatabase extends RecoverableDatabase {
  private notify?: (event: StreamEvent) => void;
  private readonly fileLinks: FileLinkIndexer;
  private readonly queueSubmissions: QueueSubmissionStore;
  private storageReclaimPending = false;
  constructor(path: string, root = process.cwd()) {
    super(openSessionDatabase(path, root));
    this.fileLinks = new FileLinkIndexer(this.db);
    this.queueSubmissions = new QueueSubmissionStore(this.db, path);
  }
  close() {
    closeDatabase(this.db);
  }
  onChange(notify: (event: StreamEvent) => void) {
    this.notify = notify;
  }
  resetSession(sessionId: string, workspace: string, profiles: readonly string[] = []) {
    const selectedProfiles = this.hasSession(sessionId) ? this.profiles(sessionId) : profiles;
    runTransaction(this.db, () => {
      resetSessionStorage(this.db, sessionId, workspace, selectedProfiles);
    });
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
    initialControl: Control = "running",
  ) {
    createSessionRecord(this.db, sessionId, workspace, profiles, initialControl);
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
  appendDraft(sessionId: string, content: string) {
    return this.queueSubmissions.appendDraft(sessionId, content);
  }
  pendingAppends(sessionId: string): QueueItem[] {
    return pendingAppendRows(this.db, sessionId);
  }
  consumedRunItems(sessionId: string, runId: number | null): QueueItem[] {
    return consumedRunRows(this.db, sessionId, runId);
  }
  nextQueue(sessionId: string): QueueItem | null {
    return nextQueueRow(this.db, sessionId);
  }
  startQueue(sessionId: string, item: QueueItem) {
    const result = runTransaction(this.db, () => {
      const userMessageId = startQueueRecord(this.db, sessionId, item),
        boundary = insertUserBoundaryEvent(this.db, sessionId, item.id);
      touchSessionRecord(this.db, sessionId);
      return { boundary, userMessageId };
    });
    if (result.boundary) {
      this.notify?.(result.boundary);
    }
    return result.userMessageId;
  }
  setQueueStatus(queueId: number, status: QueueStatus, error?: ErrorDetails) {
    runTransaction(this.db, () => {
      setQueueStatusRecord(this.db, queueId, status, error);
      touchQueueSessionRecord(this.db, queueId);
      if (status === "done" || status === "canceled") {
        deleteQueueStream(this.db, queueId);
      }
    });
    if (status === "canceled") {
      discardIndexedQueue(this.db, this.fileLinks, queueId);
    }
  }
  queueStatus(queueId: number) {
    return queueStatusRecord(this.db, queueId);
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
  takeToolCancellation(sessionId: string, callId: string) {
    return takeToolCancellation(this.db, sessionId, callId);
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
  discardQueueStream(queueId: number) {
    runTransaction(this.db, () => {
      touchQueueSessionRecord(this.db, queueId);
      deleteQueueStream(this.db, queueId);
    });
    discardIndexedQueue(this.db, this.fileLinks, queueId);
  }
}
