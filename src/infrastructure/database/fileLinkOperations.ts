import { type StreamEvent, type StreamEventDraft, insertStreamEvent } from "./records/streamEvents";
import {
  deleteQueueFileLinkUnits,
  publicFileLinkUnits,
  upsertFileLinkUnits,
} from "./records/fileLinks";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import type { FileLinkIndexer } from "./fileLinkIndexer";
import { clearToolCancellations } from "./records/toolCancellations";
import { finishToolStreams } from "./records/toolCompletion";
import { messageFileLinkSources } from "../../fileLinks/messageSources";
import { runTransaction } from "./connection";
import { syncMessages } from "./records/messages/sync";
import { touchSessionRecord } from "./records/sessions";

export async function syncIndexedHistory(options: {
  db: Database;
  fileLinks: FileLinkIndexer;
  messages: BaseMessage[];
  sessionId: string;
  workspace: string;
}) {
  const units = await options.fileLinks.prepareSources(
    options.sessionId,
    options.workspace,
    messageFileLinkSources(options.messages),
  );
  return runTransaction(options.db, () => {
    const messagesChanged = syncMessages(options.db, options.sessionId, options.messages);
    upsertFileLinkUnits(options.db, options.sessionId, units);
    const streams = finishToolStreams(options.db, options.sessionId, options.messages);
    clearToolCancellations(options.db, options.sessionId);
    if (messagesChanged || streams.changed || units.length > 0) {
      touchSessionRecord(options.db, options.sessionId);
    }
    return streams.events;
  });
}
export async function appendIndexedStream(options: {
  db: Database;
  event: StreamEventDraft;
  fileLinks: FileLinkIndexer;
  sessionId: string;
  workspace: string;
}): Promise<StreamEvent> {
  const { event } = options,
    prepared =
      event.kind === "assistant_text_delta" || event.kind === "assistant_reasoning_delta"
        ? await options.fileLinks.prepareDelta({
            delta: event.value,
            ownerId: event.messageId,
            queueId: event.queueId,
            sessionId: options.sessionId,
            surface: event.kind === "assistant_text_delta" ? "content" : "reasoning",
            workspace: options.workspace,
          })
        : undefined,
    enriched = {
      ...event,
      ...(prepared && prepared.units.length > 0
        ? { fileLinks: publicFileLinkUnits(prepared.units) }
        : {}),
    },
    inserted = runTransaction(options.db, () => {
      if (prepared) {
        upsertFileLinkUnits(options.db, options.sessionId, prepared.units);
      }
      const result = insertStreamEvent(options.db, options.sessionId, enriched);
      touchSessionRecord(options.db, options.sessionId);
      return result;
    });
  prepared?.commit();
  return inserted;
}
export function insertPlainStream(
  db: Database,
  sessionId: string,
  event: Exclude<StreamEventDraft, { kind: "assistant_text_delta" | "assistant_reasoning_delta" }>,
) {
  return runTransaction(db, () => {
    const inserted = insertStreamEvent(db, sessionId, event);
    touchSessionRecord(db, sessionId);
    return inserted;
  });
}
export function discardIndexedQueue(db: Database, fileLinks: FileLinkIndexer, queueId: number) {
  fileLinks.discardQueue(queueId);
  deleteQueueFileLinkUnits(db, queueId);
}
