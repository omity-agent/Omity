import type { Control, QueueItem, QueueStatus } from "../../types";
import {
  type StreamEvent,
  type StreamEventDraft,
  deleteQueueStream,
  finishToolStreams,
  insertStreamEvent,
  insertUserBoundaryEvent,
  streamEventCursor,
} from "./records/streamEvents";
import {
  appendDraftQueue,
  appendUserQueue,
  consumedRunRows,
  nextQueueRow,
  pendingAppendRows,
  queueStatusRecord,
  setQueueStatusRecord,
  startQueueRecord,
} from "./records/queue/operations";
import {
  clearToolCancellations,
  requestToolCancellation,
  takeToolCancellation,
} from "./records/toolCancellations";
import {
  closeDatabase,
  openSessionDatabase,
  reclaimDatabasePages,
  runTransaction,
} from "./connection";
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
import type { BaseMessage } from "@langchain/core/messages";
import type { ErrorDetails } from "../../failures/details";
import { RecoverableDatabase } from "./records/recovery";
import { loadMessages } from "./records/messages/history";
import { resetSessionStorage } from "./maintenance";
import { syncMessages } from "./records/messages/sync";

export class AgentDatabase extends RecoverableDatabase {
  private notify?: (event: StreamEvent) => void;
  private storageReclaimPending = false;
  constructor(path: string, root = process.cwd()) {
    super(openSessionDatabase(path, root));
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
  createSession(sessionId: string, workspace: string, profiles: readonly string[] = []) {
    createSessionRecord(this.db, sessionId, workspace, profiles);
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
    this.requireSession(sessionId);
    return runTransaction(this.db, () => {
      const insertedQueueId = appendUserQueue(this.db, sessionId, content);
      touchSessionRecord(this.db, sessionId);
      return insertedQueueId;
    });
  }
  appendDraft(sessionId: string, content: string) {
    this.requireSession(sessionId);
    return runTransaction(this.db, () => {
      const queueId = appendDraftQueue(this.db, sessionId, content);
      touchSessionRecord(this.db, sessionId);
      return queueId;
    });
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
      const userMessageId = startQueueRecord(this.db, sessionId, item);
      const boundary = insertUserBoundaryEvent(this.db, sessionId, item.id);
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
  syncHistory(sessionId: string, messages: BaseMessage[]) {
    this.requireSession(sessionId);
    const finished = runTransaction(this.db, () => {
      const messagesChanged = syncMessages(this.db, sessionId, messages);
      const streams = finishToolStreams(this.db, sessionId, messages);
      clearToolCancellations(this.db, sessionId);
      if (messagesChanged || streams.changed) {
        touchSessionRecord(this.db, sessionId);
      }
      return streams.events;
    });
    for (const event of finished) {
      this.notify?.(event);
    }
  }
  history(sessionId: string): BaseMessage[] {
    this.requireSession(sessionId);
    return loadMessages(this.db, sessionId);
  }
  control(sessionId: string): Control {
    return readControlRecord(this.db, sessionId);
  }
  setControl(sessionId: string, control: Control) {
    writeControlRecord(this.db, sessionId, control);
  }
  requestToolCancellation(sessionId: string, callId: string) {
    this.requireSession(sessionId);
    requestToolCancellation(this.db, sessionId, callId);
  }
  takeToolCancellation(sessionId: string, callId: string) {
    return takeToolCancellation(this.db, sessionId, callId);
  }
  appendStream(sessionId: string, event: StreamEventDraft) {
    this.requireSession(sessionId);
    const inserted = runTransaction(this.db, () => {
      const result = insertStreamEvent(this.db, sessionId, event);
      touchSessionRecord(this.db, sessionId);
      return result;
    });
    this.notify?.(inserted);
    return inserted;
  }
  discardQueueStream(queueId: number) {
    runTransaction(this.db, () => {
      touchQueueSessionRecord(this.db, queueId);
      deleteQueueStream(this.db, queueId);
    });
  }
  private requireSession(sessionId: string) {
    requireSessionRecord(this.db, sessionId);
  }
}
