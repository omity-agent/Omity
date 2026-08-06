import type { BrowserWarning } from "../../../../types";
import type { DisplayEvent } from "../../../timeline";
import type { SessionInfo } from "../../../sessionState";
import { errorDetailsSchema } from "../validation/errors";
import { z } from "../validation";

const sessionInfoSchema: z.ZodType<SessionInfo> = z.object({
  createdAt: z.number().int(),
  error: errorDetailsSchema.nullable(),
  id: z.string(),
  status: z.enum(["tool", "model", "idle", "pausing", "paused", "error"]),
  updatedAt: z.number().int(),
  workspace: z.string(),
});
const sessionsEventSchema = z.object({
  sessions: z.array(sessionInfoSchema),
});
const deletedEventSchema = z.object({ sessionId: z.string() });
const warningEventSchema: z.ZodType<BrowserWarning> = z.object({
  code: z.literal("model_api_unavailable"),
  details: z.object({
    attempt: z.number().int().positive(),
    delayMs: z.number().int().positive(),
    error: errorDetailsSchema,
    queueId: z.number().int().positive(),
    sessionId: z.string().min(1),
  }),
  message: z.string().min(1),
});
const syncEventSchema = z.object({ eventCursor: z.number().int().nonnegative() });
const eventBase = {
  id: z.number().int().positive(),
  messageId: z.string().min(1),
  partId: z.string().min(1),
  queueId: z.number().int().positive(),
};
const displayEventSchema: z.ZodType<DisplayEvent> = z.discriminatedUnion("kind", [
  z.object({
    ...eventBase,
    kind: z.enum(["assistant_reasoning_delta", "assistant_text_delta"]),
    value: z.string(),
  }),
  z.object({
    ...eventBase,
    kind: z.literal("tool_call_delta"),
    value: z.object({
      argumentsDelta: z.string().optional(),
      freeform: z.boolean().optional(),
      idDelta: z.string().optional(),
      index: z.number().int().nonnegative(),
      nameDelta: z.string().optional(),
    }),
  }),
  z.object({
    ...eventBase,
    kind: z.literal("tool_finished"),
    value: z.object({
      callId: z.string().min(1),
      output: z.object({
        content: z.string(),
        images: z.array(z.object({ mimeType: z.string(), src: z.string() })),
        outputTokens: z.number().int().nonnegative().optional(),
      }),
    }),
  }),
  z.object({
    ...eventBase,
    kind: z.literal("tool_started"),
    value: z.string().min(1),
  }),
  z.object({
    ...eventBase,
    kind: z.literal("user_appended"),
    partId: z.literal("user"),
    value: z.null(),
  }),
]);
export function readSessionsEvent(event: Event) {
  readStateEventId(event, "sessions");
  return readEventData(event, sessionsEventSchema, "sessions").sessions;
}
export function readSessionEvent(event: Event) {
  readStateEventId(event, "session");
  return readEventData(event, sessionInfoSchema, "session");
}
export function readDeletedEvent(event: Event) {
  readStateEventId(event, "deleted");
  return readEventData(event, deletedEventSchema, "deleted").sessionId;
}
export function readWarningEvent(event: Event) {
  readStateEventId(event, "warning");
  return readEventData(event, warningEventSchema, "warning");
}
export function readTranscriptEvent(event: Event) {
  const data = readEventData(event, displayEventSchema, "delta");
  const id = readNumericEventId(event, "delta");
  if (data.id !== id) {
    throw new Error("SSE delta 事件 ID 与 data.id 不一致");
  }
  return data;
}
export function readContentSyncEvent(event: Event) {
  const data = readEventData(event, syncEventSchema, "sync");
  const id = readNumericEventId(event, "sync");
  if (data.eventCursor !== id) {
    throw new Error("SSE sync 事件 ID 与 eventCursor 不一致");
  }
  return data;
}
function readEventData<T>(event: Event, schema: z.ZodType<T>, name: string) {
  if (!("data" in event) || typeof event.data !== "string") {
    throw new Error(`SSE ${name} 事件缺少字符串 data`);
  }
  let value: unknown;
  try {
    value = JSON.parse(event.data) as unknown;
  } catch (error) {
    throw new Error(`SSE ${name} 事件 JSON 无效`, { cause: error });
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`SSE ${name} 事件结构无效`);
  }
  return parsed.data;
}
function readNumericEventId(event: Event, name: string) {
  const id = Number(readEventId(event, name));
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new Error(`SSE ${name} 事件 ID 无效`);
  }
  return id;
}
function readStateEventId(event: Event, name: string) {
  const id = readEventId(event, name);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[1-9]\d*$/iu.test(id)
  ) {
    throw new Error(`SSE ${name} 事件 ID 无效`);
  }
}
function readEventId(event: Event, name: string) {
  if (!("lastEventId" in event) || typeof event.lastEventId !== "string" || !event.lastEventId) {
    throw new Error(`SSE ${name} 事件缺少 ID`);
  }
  return event.lastEventId;
}
