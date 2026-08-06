import { expect, test } from "bun:test";
import { createApi } from "../../src/app/http/handler";
import { createApiController } from "./support/apiController";

test("state SSE starts with a versioned snapshot and sends versioned mutations", async () => {
  const abort = new AbortController();
  const controller = createApiController();
  const response = await createApi(controller).request("/api/events/state", {
    signal: abort.signal,
  });
  expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
  const frames = sseFrames(response);
  const snapshot = await frames.next();
  expect(snapshot).toContain("event: sessions\n");
  expect(snapshot).toContain('data: {"sessions":[]}\n');
  const snapshotId = eventId(snapshot);
  const session = {
    createdAt: 1,
    error: null,
    id: "test",
    status: "model" as const,
    updatedAt: 2,
    workspace: "F:/workspace",
  };
  controller.events.notifySession(session);
  const changed = await frames.next();
  expect(changed).toContain(`event: session\ndata: ${JSON.stringify(session)}\n`);
  expect(eventId(changed)).not.toBe(snapshotId);
  controller.events.notifyDeleted("test");
  const deleted = await frames.next();
  expect(deleted).toContain('event: deleted\ndata: {"sessionId":"test"}\n');
  expect(eventId(deleted)).not.toBe(eventId(changed));
  controller.events.notifyWarning({
    code: "model_api_unavailable",
    details: {
      attempt: 2,
      delayMs: 1000,
      error: { message: "upstream unavailable", name: "Error" },
      queueId: 3,
      sessionId: "test",
    },
    message: "模型 API 暂不可用，正在重试",
  });
  const warning = await frames.next();
  expect(warning).toContain('event: warning\ndata: {"code":"model_api_unavailable"');
  expect(warning).toContain('"queueId":3');
  abort.abort();
  await frames.cancel();
});
test("content SSE uses the persisted cursor and sends ordered target deltas", async () => {
  const abort = new AbortController();
  const controller = createApiController();
  const response = await createApi(controller).request("/api/sessions/test/events/content", {
    signal: abort.signal,
  });
  const frames = sseFrames(response);
  expect(await frames.next()).toBe('event: sync\ndata: {"eventCursor":0}\nid: 0\n\n');
  controller.events.invalidateTranscript("other", 2);
  controller.events.invalidateTranscript("test", 4);
  expect(await frames.next()).toBe('event: sync\ndata: {"eventCursor":4}\nid: 4\n\n');
  const event = {
    id: 5,
    kind: "assistant_text_delta" as const,
    messageId: "message-1",
    partId: "text-1",
    queueId: 1,
    value: "hello",
  } as const;
  controller.events.notifyTranscript("other", { ...event, id: 3 });
  controller.events.notifyTranscript("test", event);
  expect(await frames.next()).toBe(
    `event: delta\ndata: ${JSON.stringify(event)}\nid: ${event.id.toString()}\n\n`,
  );
  abort.abort();
  await frames.cancel();
});
function sseFrames(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("SSE 响应缺少 body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    cancel: () => reader.cancel(),
    async next() {
      for (;;) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary !== -1) {
          const frame = buffer.slice(0, boundary + 2);
          buffer = buffer.slice(boundary + 2);
          return frame;
        }
        const chunk = await reader.read();
        if (chunk.done) {
          throw new Error("SSE 在下一帧前结束");
        }
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
  };
}
function eventId(frame: string) {
  const match = /^id: (?<id>.+)$/mu.exec(frame);
  if (!match?.groups?.["id"]) {
    throw new Error("SSE 帧缺少事件 ID");
  }
  return match.groups["id"];
}
