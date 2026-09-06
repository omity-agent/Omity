import { expect, mock, test } from "bun:test";
import { upsertSessionList, withoutSession } from "../../../src/app/frontend/services/queries";
import type { SessionInfo } from "../../../src/app/sessionState";
import { readSessionEvent } from "../../../src/app/frontend/services/events/data";
import { stateEvents } from "../../../src/app/frontend/services/client";

test("session upserts are idempotent across SSE and HTTP responses", () => {
  const idle = session("idle", 1),
    running = session("model", 2),
    sessions = upsertSessionList(upsertSessionList([idle], running), running);
  expect(sessions).toEqual([running]);
});
test("title-only SSE updates replace the session without changing its identity", () => {
  const previous = session("idle", 1),
    renamed = { ...previous, title: "新的会话标题" },
    event = new MessageEvent("session", {
      data: JSON.stringify(renamed),
      lastEventId: "123e4567-e89b-42d3-a456-426614174000:1",
    });
  expect(upsertSessionList([previous], readSessionEvent(event))).toEqual([renamed]);
});
test("session deletion is idempotent", () => {
  const once = withoutSession([session("idle", 1)], "session");
  expect(withoutSession(once, "session")).toEqual([]);
});
test("SSE keeps the native reconnect behavior after a network error", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "EventSource"),
    created: TestEventSource[] = [];
  class TestEventSource extends EventTarget {
    close = mock(() => undefined);
    constructor(readonly url: string) {
      super();
      created.push(this);
    }
  }
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value: TestEventSource,
  });
  try {
    stateEvents();
    const [events] = created;
    if (!events) {
      throw new Error("EventSource 替身未创建");
    }
    expect(events.url).toBe("api/events/state");
    events.dispatchEvent(new Event("error"));
    expect(events.close).not.toHaveBeenCalled();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "EventSource", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "EventSource");
    }
  }
});
function session(status: SessionInfo["status"], updatedAt: number): SessionInfo {
  return {
    createdAt: 1,
    error: null,
    id: "session",
    status,
    title: "session",
    updatedAt,
    workspace: "F:/workspace",
  };
}
