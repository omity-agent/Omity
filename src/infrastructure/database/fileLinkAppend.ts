import type { StreamEvent, StreamEventDraft } from "./records/streamEvents";
import { appendIndexedStream, insertPlainStream } from "./fileLinkOperations";
import type { Database } from "bun:sqlite";
import type { FileLinkIndexer } from "./fileLinkIndexer";

export function appendFileLinkStream(options: {
  db: Database;
  event: StreamEventDraft;
  fileLinks: FileLinkIndexer;
  notify?: (event: StreamEvent) => void;
  sessionId: string;
  workspace: string;
}) {
  if (isTextEvent(options.event)) {
    return appendIndexedAndNotify({
      ...options,
      event: options.event,
    });
  }
  const inserted = insertPlainStream(options.db, options.sessionId, options.event);
  options.notify?.(inserted);
  return inserted;
}
async function appendIndexedAndNotify(options: {
  db: Database;
  event: Extract<StreamEventDraft, { kind: "assistant_text_delta" | "assistant_reasoning_delta" }>;
  fileLinks: FileLinkIndexer;
  notify?: (event: StreamEvent) => void;
  sessionId: string;
  workspace: string;
}) {
  const inserted = await appendIndexedStream(options);
  options.notify?.(inserted);
  return inserted;
}
function isTextEvent(
  event: StreamEventDraft,
): event is Extract<
  StreamEventDraft,
  { kind: "assistant_text_delta" | "assistant_reasoning_delta" }
> {
  return event.kind === "assistant_text_delta" || event.kind === "assistant_reasoning_delta";
}
