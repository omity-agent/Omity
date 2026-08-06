import { expect, test } from "bun:test";
import {
  readContentSyncEvent,
  readSessionEvent,
  readTranscriptEvent,
} from "../../../src/app/frontend/services/events/data";

test("state events require an epoch and sequence ID", () => {
  const data = JSON.stringify({
    createdAt: 1,
    error: null,
    id: "session",
    status: "idle",
    updatedAt: 1,
    workspace: "F:/workspace",
  });
  expect(() => readSessionEvent(message(data, ""))).toThrow("缺少 ID");
  expect(() => readSessionEvent(message(data, "4"))).toThrow("ID 无效");
  expect(readSessionEvent(message(data, "123e4567-e89b-42d3-a456-426614174000:1"))).toMatchObject({
    id: "session",
  });
});
test("state events validate structured session errors", () => {
  const data = JSON.stringify({
    createdAt: 1,
    error: { message: "failed", name: "Error", stack: 42 },
    id: "session",
    status: "error",
    updatedAt: 1,
    workspace: "F:/workspace",
  });
  expect(() => readSessionEvent(message(data, "123e4567-e89b-42d3-a456-426614174000:1"))).toThrow(
    "SSE session 事件结构无效",
  );
});
test("content event IDs must match their persisted cursors", () => {
  expect(readContentSyncEvent(message('{"eventCursor":4}', "4"))).toEqual({
    eventCursor: 4,
  });
  expect(() => readContentSyncEvent(message('{"eventCursor":4}', "3"))).toThrow(
    "eventCursor 不一致",
  );
  const delta = JSON.stringify({
    id: 5,
    kind: "assistant_text_delta",
    messageId: "message",
    partId: "text",
    queueId: 1,
    value: "hello",
  });
  expect(readTranscriptEvent(message(delta, "5"))).toMatchObject({ id: 5 });
  expect(() => readTranscriptEvent(message(delta, "6"))).toThrow("data.id 不一致");
});
function message(data: string, lastEventId: string) {
  return new MessageEvent("test", { data, lastEventId });
}
