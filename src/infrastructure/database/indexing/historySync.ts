import type { StreamEvent, StreamEventDraft } from "../../../types";
import { publicFileLinkUnits, upsertFileLinkUnits } from "../records/transcript/fileLinks";
import type { BaseMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import type { FileLinkIndexer } from "./linkScanner";
import { clearCompletedCancellations } from "../records/execution/toolCancellations";
import { finishToolStreams } from "../records/transcript/toolCompletion";
import { insertStreamEvent } from "../records/transcript/streamEvents";
import { messageFileLinkSources } from "../../../fileLinks/messageSources";
import { prepareMessageSync } from "../records/transcript/messages/sync";
import { runTransaction } from "../sqlite/connection";
import { touchSessionRecord } from "../records/session/metadata";

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
    const history = prepareMessageSync(options.db, options.sessionId, options.messages);
    history.commit();
    upsertFileLinkUnits(options.db, options.sessionId, units);
    const streams = finishToolStreams(options.db, options.sessionId, options.messages);
    clearCompletedCancellations(options.db, options.sessionId, options.messages);
    if (history.changed || streams.changed || units.length > 0) {
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
            inputId: event.inputId,
            ownerId: event.messageId,
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
