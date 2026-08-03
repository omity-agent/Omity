import { expect, test } from "bun:test";
import { SessionAttentionStore } from "../../../src/app/frontend/services/events/attention";
import type { SessionStatus } from "../../../src/types";

test("initial stopped sessions do not request attention", () => {
  const store = new SessionAttentionStore();
  store.replace([session("paused")]);
  expect([...store.snapshot()]).toEqual([]);
});
test("an unviewed session requests attention when it stops", () => {
  const store = new SessionAttentionStore();
  store.replace([session("model")]);
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
  store.replace([session("model")]);
  store.replace([session("paused")]);
  expect([...store.snapshot()]).toEqual([]);
});
test("a reconnect snapshot clears attention for a resumed session", () => {
  const store = new SessionAttentionStore();
  store.replace([session("model")]);
  store.upsert(session("paused"));
  store.replace([session("model")]);
  expect([...store.snapshot()]).toEqual([]);
});
function session(status: SessionStatus) {
  return { id: "session", status };
}
