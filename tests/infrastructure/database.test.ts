import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import {
  cleanupDatabaseDirs,
  makeDatabases,
  makeDb,
  required,
  workspace,
} from "../support/database";
import { runTransaction, sqliteBusyTimeoutMs } from "../../src/infrastructure/database/connection";
import { appendAssistantMessage } from "../../src/infrastructure/database/records/messages/history";
import { decodeMessage } from "../../src/infrastructure/database/records/messages/hydration";
import { encodeMessage } from "../../src/infrastructure/database/records/messages/payload";

afterEach(cleanupDatabaseDirs);
test("queue append and transcript lifecycle", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = db.appendUser("123", "你好");
  const item = db.nextQueue("123");
  expect(item?.id).toBe(queueId);
  db.startQueue("123", required(item));
  expect(db.history("123").map((message) => message.text)).toEqual(["你好"]);
  appendAssistantMessage(db.db, "123", "你好，有什么可以帮你？");
  db.setQueueStatus(queueId, "done");
  expect(db.history("123").at(-1)?.text).toBe("你好，有什么可以帮你？");
  db.close();
});
test("database waits for transient writer contention", () => {
  const db = makeDb();
  const row = db.db.query<{ timeout: number }, []>("PRAGMA busy_timeout").get();
  expect(row?.timeout).toBe(sqliteBusyTimeoutMs);
  expect(db.db.query<{ auto_vacuum: number }, []>("PRAGMA auto_vacuum").get()?.auto_vacuum).toBe(2);
  db.close();
});
test("existing sessions are explicit", () => {
  const db = makeDb();
  expect(db.hasSession("123")).toBe(false);
  db.createSession("123", workspace, ["base", "work"]);
  expect(db.hasSession("123")).toBe(true);
  expect(db.profiles("123")).toEqual(["base", "work"]);
  db.resetSession("123", workspace);
  expect(db.profiles("123")).toEqual(["base", "work"]);
  expect(() => {
    db.createSession("123", workspace);
  }).toThrow("会话已存在：123");
  db.close();
});
test("client operations reject missing sessions", () => {
  const db = makeDb();
  expect(() => db.appendUser("missing", "你好")).toThrow("会话不存在：missing");
  expect(() => {
    db.setControl("missing", "pause");
  }).toThrow("会话不存在：missing");
  db.close();
});
test("nested database transactions roll back to their own boundary", () => {
  const db = makeDb();
  db.createSession("outer", workspace);
  runTransaction(db.db, () => {
    db.createSession("committed", workspace);
    expect(() =>
      runTransaction(db.db, () => {
        db.createSession("rolled-back", workspace);
        throw new Error("rollback nested transaction");
      }),
    ).toThrow("rollback nested transaction");
  });
  expect(db.hasSession("outer")).toBe(true);
  expect(db.hasSession("committed")).toBe(true);
  expect(db.hasSession("rolled-back")).toBe(false);
  db.close();
});
test("host lease excludes concurrent owners and permits takeover after expiry", () => {
  const databases = makeDatabases(2);
  const first = required(databases[0]);
  const second = required(databases[1]);
  first.resetSession("123", workspace);
  expect(
    first.acquireHostLease({
      now: 1000,
      ownerId: "host-a",
      sessionId: "123",
      ttlMs: 100,
    }),
  ).toBe(true);
  expect(
    second.acquireHostLease({
      now: 1050,
      ownerId: "host-b",
      sessionId: "123",
      ttlMs: 100,
    }),
  ).toBe(false);
  expect(
    second.renewHostLease({
      now: 1050,
      ownerId: "host-b",
      sessionId: "123",
      ttlMs: 100,
    }),
  ).toBe(false);
  expect(
    second.acquireHostLease({
      now: 1101,
      ownerId: "host-b",
      sessionId: "123",
      ttlMs: 100,
    }),
  ).toBe(true);
  expect(first.releaseHostLease("123", "host-a")).toBe(false);
  expect(second.releaseHostLease("123", "host-b")).toBe(true);
  first.close();
  second.close();
});
test("queue start atomically rejects a stale claim", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "只应写入一次");
  const stale = required(db.nextQueue("123"));
  db.startQueue("123", stale);
  expect(() => db.startQueue("123", stale)).toThrow("队列认领冲突");
  expect(db.history("123").map((message) => message.text)).toEqual(["只应写入一次"]);
  db.close();
});
test("conversation and queue changes advance the session activity time", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  setUpdatedAt(db, 1);
  db.syncHistory("123", [
    new HumanMessage({ content: "你好", id: "user" }),
    new AIMessage({ content: "你好，有什么可以帮你？", id: "assistant" }),
  ]);
  expect(updatedAt(db)).toBeGreaterThan(1);
  setUpdatedAt(db, 1);
  db.syncHistory("123", [
    new HumanMessage({ content: "你好", id: "user" }),
    new AIMessage({ content: "你好，有什么可以帮你？", id: "assistant" }),
  ]);
  expect(updatedAt(db)).toBe(1);
  setUpdatedAt(db, 1);
  const queueId = db.appendUser("123", "继续");
  setUpdatedAt(db, 1);
  db.setQueueStatus(queueId, "canceled");
  expect(updatedAt(db)).toBeGreaterThan(1);
  db.close();
});
test("persists custom tool markers in tool metadata", () => {
  const message = new ToolMessage({
    content: "工具结果",
    metadata: { customTool: true },
    tool_call_id: "call-1",
  });
  const stored = encodeMessage(message, "history");
  const restored = decodeMessage(JSON.stringify(stored));
  expect(stored).toMatchObject({ custom: true });
  expect(restored).toMatchObject({ metadata: { customTool: true } });
});
function setUpdatedAt(database: ReturnType<typeof makeDb>, value: number) {
  database.db.run("UPDATE sessions SET updated_at = ? WHERE id = '123'", [value]);
}
function updatedAt(database: ReturnType<typeof makeDb>) {
  return required(
    database.db.query<{ updated_at: number }, []>("SELECT updated_at FROM sessions").get(),
  ).updated_at;
}
