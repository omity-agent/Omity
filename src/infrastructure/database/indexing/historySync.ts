import type { Database } from "bun:sqlite";

import type { BaseMessage } from "@langchain/core/messages";

import { messageFileLinkSources } from "../../../fileLinks/messageSources";
import type { StreamEvent, StreamEventDraft } from "../../../types";
import { clearCompletedCancellations } from "../records/execution/toolCancellations";
import { touchSessionRecord } from "../records/session/metadata";
import {
  clearMessageLinks,
  clearStreamLinks,
  writeFileLinkSets,
} from "../records/transcript/matchedFiles";
import { prepareMessageSync } from "../records/transcript/messages/sync";
import { insertStreamEvent } from "../records/transcript/streamEvents";
import { finishToolStreams } from "../records/transcript/toolCompletion";
import { runTransaction } from "../sqlite/connection";
import type { FileLinkIndexer } from "./surfaceIndexer";

export async function syncIndexedHistory(options: {
  db: Database;
  fileLinks: FileLinkIndexer;
  messages: BaseMessage[];
  sessionId: string;
  workspace: string;
}) {
  const history = prepareMessageSync(options.db, options.sessionId, options.messages),
    prepared = await options.fileLinks.prepareHistory({ ...options, updated: history.updated }),
    obsoleteOwners = messageFileLinkSources(history.previous).map((source) => source.ownerId),
    finished = runTransaction(options.db, () => {
      history.commit();
      clearMessageLinks(
        options.db,
        options.sessionId,
        prepared.replaceAll ? undefined : obsoleteOwners,
      );
      const clearedLinks = clearStreamLinks(options.db, options.sessionId);
      writeFileLinkSets(options.db, options.sessionId, prepared.links);
      const streams = finishToolStreams(options.db, options.sessionId, options.messages);
      clearCompletedCancellations(options.db, options.sessionId, options.messages);
      if (history.changed || streams.changed || clearedLinks > 0) {
        touchSessionRecord(options.db, options.sessionId);
      }
      return streams.events;
    });
  prepared.commit();
  return finished;
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
      ...(prepared && prepared.links.length > 0
        ? {
            fileLinks: prepared.links.map(({ matches, ownerId, surface }) => ({
              matches,
              ownerId,
              surface,
            })),
          }
        : {}),
    },
    inserted = runTransaction(options.db, () => {
      if (prepared) {
        writeFileLinkSets(options.db, options.sessionId, prepared.links);
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
