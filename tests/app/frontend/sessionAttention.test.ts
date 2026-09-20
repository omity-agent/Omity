import { expect, mock, test } from "bun:test";
import { SessionAttentionStore } from "../../../src/app/frontend/services/events/attention";
import type { SessionStatus } from "../../../src/types";

test("initial stopped sessions do not request attention", () => {
  const store = new SessionAttentionStore();
  store.replace([session("paused")]);
  expect([...store.snapshot()]).toEqual([]);
});
test.each(["waiting", "streaming"] as const)(
  "an unviewed %s session requests attention when it stops",
  (status) => {
    const store = new SessionAttentionStore();
    store.replace([session(status)]);
    store.upsert(session("idle"));
    expect([...store.snapshot()]).toEqual(["session"]);
  },
);
test("model response and retry transitions do not mark a session unread", () => {
  const store = new SessionAttentionStore();
  store.replace([session("waiting")]);
  store.upsert(session("streaming"));
  expect([...store.snapshot()]).toEqual([]);
  store.upsert(session("waiting"));
  expect([...store.snapshot()]).toEqual([]);
  store.upsert(session("streaming"));
  store.upsert(session("idle"));
  expect([...store.snapshot()]).toEqual(["session"]);
});
test("pausing remains active until the session reaches pause", () => {
  const store = new SessionAttentionStore();
  store.replace([session("pausing")]);
  store.upsert(session("paused"));
  expect([...store.snapshot()]).toEqual(["session"]);
});
test("viewing and resuming clear session attention", () => {
  const store = new SessionAttentionStore();
  store.replace([session("tool")]);
  store.upsert(session("error"));
  store.view("session");
  expect([...store.snapshot()]).toEqual([]);
  store.upsert(session("tool"));
  expect([...store.snapshot()]).toEqual([]);
});
test("a reconnect snapshot does not report pauses caused by server shutdown", () => {
  const store = new SessionAttentionStore();
  store.replace([session("streaming")]);
  store.replace([session("paused")]);
  expect([...store.snapshot()]).toEqual([]);
});
test("a reconnect snapshot clears attention for a resumed session", () => {
  const store = new SessionAttentionStore();
  store.replace([session("streaming")]);
  store.upsert(session("paused"));
  store.replace([session("waiting")]);
  expect([...store.snapshot()]).toEqual([]);
});
test("未读变化只通知有效订阅者且不重复通知相同快照", () => {
  const store = new SessionAttentionStore(),
    listener = mock(),
    unsubscribe = store.subscribe(listener);
  store.replace([session("streaming")]);
  store.upsert(session("idle"));
  store.upsert(session("idle"));
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  store.view("session");
  expect(listener).toHaveBeenCalledTimes(1);
});
function session(status: SessionStatus) {
  return { id: "session", status };
}
