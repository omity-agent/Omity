import { expect, mock, test } from "bun:test";
import { AppEvents } from "../../src/app/events";
import { createApi } from "../../src/app/http/handler";
import { createApiController } from "./support/apiController";

test("唤醒仅通知同一会话，并广播给该会话的所有等待者", async () => {
  const events = new AppEvents(),
    otherWoke = mock(),
    other = observe(events.wait("other", 60_000), otherWoke),
    first = events.wait("target", 60_000),
    second = events.wait("target", 60_000);
  events.wake("target");
  await Promise.all([first, second]);
  expect(otherWoke).not.toHaveBeenCalled();
  events.wake("other");
  await other;
  expect(otherWoke).toHaveBeenCalledTimes(1);
});
test("state SSE starts with a versioned snapshot and sends versioned mutations", async () => {
  const abort = new AbortController(),
    controller = createApiController(),
    response = await createApi(controller).request("/api/events/state", {
      signal: abort.signal,
    });
  expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
  const frames = sseFrames(response),
    snapshot = await frames.next();
  expect(snapshot).toContain("event: sessions\n");
  expect(snapshot).toContain('data: {"sessions":[]}\n');
  const snapshotId = eventId(snapshot),
    session = {
      createdAt: 1,
      error: null,
      id: "test",
      status: "waiting" as const,
      title: "test",
      updatedAt: 2,
      workspace: "F:/workspace",
    };
  controller.events.notifySession(session);
  const changed = await frames.next();
  expect(changed).toContain(`event: session\ndata: ${JSON.stringify(session)}\n`);
  expect(eventId(changed)).not.toBe(snapshotId);
  controller.events.notifySession({ ...session, status: "streaming" });
  const streaming = await frames.next();
  expect(streaming).toContain('"status":"streaming"');
  expect(eventId(streaming)).not.toBe(eventId(changed));
  controller.events.notifySession({ ...session, title: "新的会话标题" });
  const renamed = await frames.next();
  expect(renamed).toContain('"title":"新的会话标题"');
  expect(eventId(renamed)).not.toBe(eventId(changed));
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
  const abort = new AbortController(),
    controller = createApiController(),
    response = await createApi(controller).request("/api/sessions/test/events/content", {
      signal: abort.signal,
    }),
    frames = sseFrames(response);
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
test("content subscriptions stay isolated across sessions and independent within a session", async () => {
  const controller = createApiController(),
    api = createApi(controller),
    first = sseFrames(await api.request("/api/sessions/test/events/content")),
    second = sseFrames(await api.request("/api/sessions/test/events/content")),
    other = sseFrames(await api.request("/api/sessions/other/events/content"));
  try {
    await Promise.all([first.next(), second.next(), other.next()]);
    controller.events.invalidateTranscript("test", 10);
    controller.events.invalidateTranscript("other", 20);
    expect(await first.next()).toContain('data: {"eventCursor":10}');
    expect(await second.next()).toContain('data: {"eventCursor":10}');
    expect(await other.next()).toContain('data: {"eventCursor":20}');
    await first.cancel();
    controller.events.invalidateTranscript("test", 11);
    expect(await second.next()).toContain('data: {"eventCursor":11}');
    await second.cancel();
    const reopened = sseFrames(await api.request("/api/sessions/test/events/content"));
    try {
      await reopened.next();
      controller.events.invalidateTranscript("test", 12);
      expect(await reopened.next()).toContain('data: {"eventCursor":12}');
    } finally {
      await reopened.cancel();
    }
  } finally {
    await Promise.all([first.cancel(), second.cancel(), other.cancel()]);
  }
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
async function observe(waiting: Promise<void>, completed: () => void) {
  await waiting;
  completed();
}
