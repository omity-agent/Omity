import { expect, test } from "bun:test";
import {
  readContentSyncEvent,
  readSessionEvent,
  readTranscriptEvent,
  readWarningEvent,
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
  const finished = JSON.stringify({
    id: 7,
    kind: "tool_finished",
    messageId: "message",
    partId: "tool-0",
    queueId: 1,
    value: {
      callId: "call-1",
      output: { content: "done", images: [], outputTokens: 1 },
    },
  });
  expect(readTranscriptEvent(message(finished, "7"))).toMatchObject({
    kind: "tool_finished",
    value: { callId: "call-1", output: { content: "done" } },
  });
});
test("warning events validate the model retry payload", () => {
  expect(
    readWarningEvent(
      message(
        JSON.stringify({
          code: "model_api_unavailable",
          details: {
            attempt: 2,
            delayMs: 1000,
            error: { message: "upstream unavailable", name: "Error" },
            queueId: 3,
            sessionId: "session",
          },
          message: "模型 API 暂不可用，正在重试",
        }),
        "123e4567-e89b-42d3-a456-426614174000:2",
      ),
    ),
  ).toMatchObject({ code: "model_api_unavailable", details: { attempt: 2 } });
});
function message(data: string, lastEventId: string) {
  return new MessageEvent("test", { data, lastEventId });
}
