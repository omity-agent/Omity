import {
  deletedEventSchema,
  sessionFailureSchema,
  sessionInfoSchema,
  sessionsEventSchema,
  syncEventSchema,
  warningEventSchema,
} from "../../../events/contracts";
import { eventSchema } from "../validation/responses";
import { localize } from "../../i18n";
import type { z } from "../validation";

export function readSessionsEvent(event: Event) {
  readStateEventId(event, "sessions");
  return readEventData(event, sessionsEventSchema, "sessions").sessions;
}
export function readRestorationEvent(event: Event) {
  readStateEventId(event, "restore");
  return readEventData(event, sessionsEventSchema, "restore").sessions;
}
export function readFailureEvent(event: Event) {
  readStateEventId(event, "failure");
  return readEventData(event, sessionFailureSchema, "failure");
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
  const data = readEventData(event, eventSchema, "delta"),
    id = readNumericEventId(event, "delta");
  if (data.id !== id) {
    throw new Error(localize("frontend:events.deltaIdMismatch"));
  }
  return data;
}
export function readContentSyncEvent(event: Event) {
  const data = readEventData(event, syncEventSchema, "sync"),
    id = readNumericEventId(event, "sync");
  if (data.eventCursor !== id) {
    throw new Error(localize("frontend:events.syncCursorMismatch"));
  }
  return data;
}
function readEventData<T>(event: Event, schema: z.ZodType<T>, name: string) {
  if (!("data" in event) || typeof event.data !== "string") {
    throw new Error(localize("frontend:events.dataMissing", { value0: name }));
  }
  let value: unknown;
  try {
    value = JSON.parse(event.data) as unknown;
  } catch (error) {
    throw new Error(localize("frontend:events.jsonInvalid", { value0: name }), { cause: error });
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(localize("frontend:events.payloadInvalid", { value0: name }));
  }
  return parsed.data;
}
function readNumericEventId(event: Event, name: string) {
  const id = Number(readEventId(event, name));
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new Error(localize("frontend:events.idInvalid", { value0: name }));
  }
  return id;
}
function readStateEventId(event: Event, name: string) {
  const id = readEventId(event, name);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[1-9]\d*$/iu.test(id)
  ) {
    throw new Error(localize("frontend:events.stateIdInvalid", { value0: name }));
  }
}
function readEventId(event: Event, name: string) {
  if (!("lastEventId" in event) || typeof event.lastEventId !== "string" || !event.lastEventId) {
    throw new Error(localize("frontend:events.idMissing", { value0: name }));
  }
  return event.lastEventId;
}
