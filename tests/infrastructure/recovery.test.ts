import { afterEach, expect, test } from "bun:test";
import { captureError, parseError, stringifyError } from "../../src/failures/details";
import { cleanupDatabaseDirs, makeDb, required, runOf, workspace } from "../support/database";

afterEach(cleanupDatabaseDirs);
test("recovery refuses a live lease unless its exact owner is confirmed dead", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const inputId = db.appendUser("123", "继续运行");
  db.consumeInput("123", required(db.nextInput("123")));
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
  expect(db.runStatus(runOf(db, inputId))).toBe("running");
  expect(
    db.recoverInterruptedSession({
      confirmedDeadOwnerId: "host-a",
      now: 1050,
      sessionId: "123",
    }),
  ).toEqual({ action: "paused", activeItems: 1, status: "recovered" });
  expect(db.runStatus(runOf(db, inputId))).toBe("paused");
  expect(db.control("123")).toBe("pause");
  expect(db.hostLease("123")).toBeNull();
  db.setControl("123", "running");
  db.consumeInput("123", required(db.activeInputs("123")[0]));
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
  db.consumeInput("123", required(db.nextInput("123")));
  db.consumeInput("123", required(db.pendingInputs("123")[0]));
  db.setRunStatus(runOf(db, paused), "paused");
  db.setControl("123", "pause_cancel");
  expect(db.recoverInterruptedSession({ now: 1000, sessionId: "123" })).toEqual({
    action: "paused",
    activeItems: 3,
    status: "recovered",
  });
  expect(db.activeInputs("123").map(({ id, status }) => ({ id, status }))).toEqual([
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
  const inputId = db.appendUser("123", "已经暂停");
  db.setRunStatus(runOf(db, inputId), "paused");
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
  db.consumeInput("123", required(db.nextInput("123")));
  await db.appendStream("123", {
    inputId: root,
    kind: "assistant_text_delta",
    messageId: "message-1",
    partId: "text-1",
    value: "partial",
  });
  await db.appendStream("123", {
    inputId: appended,
    kind: "assistant_text_delta",
    messageId: "message-2",
    partId: "text-1",
    value: "partial append",
  });
  db.setControl("123", "cancel");
  expect(db.recoverInterruptedSession({ now: 1000, sessionId: "123" })).toEqual({
    action: "canceled",
    activeItems: 2,
    status: "recovered",
  });
  expect([db.runStatus(runOf(db, root)), db.runStatus(runOf(db, appended))]).toEqual([
    "canceled",
    "canceled",
  ]);
  expect(db.control("123")).toBe("running");
  expect(count(db, "events", "session_id = '123'")).toBe(0);
  db.close();
});
test("pauseRun is atomic, preserves pending work and omitted errors", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const root = db.appendUser("123", "第一条");
  db.appendUser("123", "第二条");
  const runId = runOf(db, root),
    appendedItem = required(db.activeInputs("123")[1]);
  db.consumeInput("123", required(db.nextInput("123")));
  db.consumeInput("123", appendedItem);
  db.appendUser("123", "仍在等待");
  const oldError = captureError(new Error("旧错误"));
  db.db.run("UPDATE runs SET error_json = ? WHERE id = ?", [stringifyError(oldError), runId]);
  db.db.run(
    `CREATE TRIGGER fail_group_pause BEFORE UPDATE ON runs
     WHEN OLD.id = ${runId.toString()} AND NEW.status = 'paused'
     BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
  );
  expect(() => db.pauseRun("123", runId)).toThrow("injected failure");
  expect(db.control("123")).toBe("running");
  expect(db.activeInputs("123").map(({ status }) => status)).toEqual([
    "running",
    "running",
    "pending",
  ]);
  db.db.run("DROP TRIGGER fail_group_pause");
  expect(db.pauseRun("123", runId)).toBe(1);
  expect(db.control("123")).toBe("pause");
  expect(db.activeInputs("123").map(({ status }) => status)).toEqual([
    "paused",
    "paused",
    "pending",
  ]);
  const rows = db.db
    .query<{ id: number; error: string | null }, []>(
      "SELECT id, error_json AS error FROM runs ORDER BY id",
    )
    .all();
  expect(parseError(required(rows[0]?.error))).toMatchObject({
    message: "旧错误",
  });
  expect(rows).toHaveLength(1);
  const replacement = captureError(new Error("新错误"));
  expect(db.pauseRun("123", runId, replacement)).toBe(1);
  const errors = db.db
    .query<{ error: string | null }, []>("SELECT error_json AS error FROM runs ORDER BY id")
    .all();
  expect(parseError(required(errors[0]?.error)).message).toBe("新错误");
  expect(errors).toHaveLength(1);
  db.close();
});
function count(db: ReturnType<typeof makeDb>, table: "events", predicate: string) {
  return required(
    db.db
      .query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`)
      .get(),
  ).count;
}
