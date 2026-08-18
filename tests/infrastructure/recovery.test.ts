import { afterEach, expect, test } from "bun:test";
import { captureError, parseError, stringifyError } from "../../src/failures/details";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";

afterEach(cleanupDatabaseDirs);
test("recovery refuses a live lease unless its exact owner is confirmed dead", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = db.appendUser("123", "继续运行");
  db.startQueue("123", required(db.nextQueue("123")));
  db.acquireHostLease({
    now: 1000,
    ownerId: "host-a",
    sessionId: "123",
    ttlMs: 100,
  });
  expect(db.hostLease("123")).toEqual({
    expiresAt: 1100,
    ownerId: "host-a",
    sessionId: "123",
  });
  expect(db.recoverInterruptedSession({ now: 1050, sessionId: "123" })).toMatchObject({
    status: "blocked",
  });
  expect(
    db.recoverInterruptedSession({
      confirmedDeadOwnerId: "host-b",
      now: 1050,
      sessionId: "123",
    }),
  ).toMatchObject({ status: "blocked" });
  expect(db.queueStatus(queueId)).toBe("running");
  expect(
    db.recoverInterruptedSession({
      confirmedDeadOwnerId: "host-a",
      now: 1050,
      sessionId: "123",
    }),
  ).toEqual({ action: "paused", activeItems: 1, status: "recovered" });
  expect(db.queueStatus(queueId)).toBe("paused");
  expect(db.control("123")).toBe("pause");
  expect(db.hostLease("123")).toBeNull();
  db.setControl("123", "running");
  db.startQueue("123", required(db.activeQueue("123")[0]));
  db.acquireHostLease({
    now: 2000,
    ownerId: "host-c",
    sessionId: "123",
    ttlMs: 100,
  });
  expect(db.recoverInterruptedSession({ now: 2100, sessionId: "123" })).toMatchObject({
    action: "paused",
    status: "recovered",
  });
  expect(db.hostLease("123")).toBeNull();
  db.close();
});
test("recovery preserves pending work while normalizing an interrupted run", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const running = db.appendUser("123", "运行中"),
    paused = db.appendUser("123", "已经暂停"),
    pending = db.appendUser("123", "仍在等待");
  db.startQueue("123", required(db.nextQueue("123")));
  db.setQueueStatus(paused, "paused");
  db.setControl("123", "pause_cancel");
  expect(db.recoverInterruptedSession({ now: 1000, sessionId: "123" })).toEqual({
    action: "paused",
    activeItems: 3,
    status: "recovered",
  });
  expect(db.activeQueue("123").map(({ id, status }) => ({ id, status }))).toEqual([
    { id: running, status: "paused" },
    { id: paused, status: "paused" },
    { id: pending, status: "pending" },
  ]);
  expect(db.control("123")).toBe("pause");
  db.close();
});
test("recovery leaves a stable paused session activity time unchanged", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const queueId = db.appendUser("123", "已经暂停");
  db.setQueueStatus(queueId, "paused");
  db.setControl("123", "pause");
  db.db.run("UPDATE sessions SET updated_at = 1 WHERE id = '123'");
  expect(db.recoverInterruptedSession({ now: 1000, sessionId: "123" })).toEqual({
    action: "paused",
    activeItems: 1,
    status: "recovered",
  });
  expect(db.db.query<{ updated_at: number }, []>("SELECT updated_at FROM sessions").get()).toEqual({
    updated_at: 1,
  });
  expect(db.transcriptRevision("123")).toBe(3);
  db.close();
});
test("recovery completes a persisted cancel and removes only its run data", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const root = db.appendUser("123", "取消我"),
    appended = db.appendUser("123", "也取消我");
  db.startQueue("123", required(db.nextQueue("123")));
  await db.appendStream("123", {
    kind: "assistant_text_delta",
    messageId: "message-1",
    partId: "text-1",
    queueId: root,
    value: "partial",
  });
  await db.appendStream("123", {
    kind: "assistant_text_delta",
    messageId: "message-2",
    partId: "text-1",
    queueId: appended,
    value: "partial append",
  });
  db.setControl("123", "cancel");
  expect(db.recoverInterruptedSession({ now: 1000, sessionId: "123" })).toEqual({
    action: "canceled",
    activeItems: 2,
    status: "recovered",
  });
  expect([db.queueStatus(root), db.queueStatus(appended)]).toEqual(["canceled", "canceled"]);
  expect(db.control("123")).toBe("running");
  expect(count(db, "events", "session_id = '123'")).toBe(0);
  db.close();
});
test("pauseRun is atomic, preserves pending work and omitted errors", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const root = db.appendUser("123", "第一条"),
    appended = db.appendUser("123", "第二条"),
    appendedItem = required(db.activeQueue("123")[1]);
  db.startQueue("123", required(db.nextQueue("123")));
  db.startQueue("123", appendedItem);
  db.appendUser("123", "仍在等待");
  const oldError = captureError(new Error("旧错误"));
  db.db.run("UPDATE queue SET error = ? WHERE id = ?", [stringifyError(oldError), root]);
  db.db.run(
    `CREATE TRIGGER fail_group_pause BEFORE UPDATE ON queue
     WHEN OLD.id = ${appended.toString()} AND NEW.status = 'paused'
     BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
  );
  expect(() => db.pauseRun("123", root)).toThrow("injected failure");
  expect(db.control("123")).toBe("running");
  expect(db.activeQueue("123").map(({ status }) => status)).toEqual([
    "running",
    "running",
    "pending",
  ]);
  db.db.run("DROP TRIGGER fail_group_pause");
  expect(db.pauseRun("123", root)).toBe(2);
  expect(db.control("123")).toBe("pause");
  expect(db.activeQueue("123").map(({ status }) => status)).toEqual([
    "paused",
    "paused",
    "pending",
  ]);
  const rows = db.db
    .query<{ id: number; error: string | null }, []>("SELECT id, error FROM queue ORDER BY id")
    .all();
  expect(parseError(required(rows[0]?.error))).toMatchObject({
    message: "旧错误",
  });
  expect(rows[1]?.error).toBeNull();
  expect(rows[2]?.error).toBeNull();
  const replacement = captureError(new Error("新错误"));
  expect(db.pauseRun("123", root, replacement)).toBe(2);
  const errors = db.db
    .query<{ error: string | null }, []>("SELECT error FROM queue ORDER BY id")
    .all();
  expect(parseError(required(errors[0]?.error)).message).toBe("新错误");
  expect(parseError(required(errors[1]?.error)).message).toBe("新错误");
  expect(errors[2]?.error).toBeNull();
  db.close();
});
function count(db: ReturnType<typeof makeDb>, table: "events", predicate: string) {
  return required(
    db.db
      .query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`)
      .get(),
  ).count;
}
