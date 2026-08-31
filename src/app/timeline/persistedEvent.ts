import { type StreamEvent, type StreamEventKind, streamEventSchema } from "../../types";

export interface PersistedEventRow {
  id: number;
  queue_id: number;
  message_id: string;
  part_id: string;
  kind: StreamEventKind;
  payload_json: string;
  file_links_json: string;
}
export function persistedDisplayEvent(row: PersistedEventRow): StreamEvent {
  const fileLinks: unknown = JSON.parse(row.file_links_json),
   parsed = streamEventSchema.safeParse({
    ...(Array.isArray(fileLinks) && fileLinks.length === 0 ? {} : { fileLinks }),
    id: row.id,
    kind: row.kind,
    messageId: row.message_id,
    partId: row.part_id,
    queueId: row.queue_id,
    value: JSON.parse(row.payload_json) as unknown,
  });
  if (!parsed.success) {
    throw new Error("持久化流式事件无效", { cause: parsed.error });
  }
  return parsed.data;
}
