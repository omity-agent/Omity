import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, runOf, workspace } from "../support/database";
import { BunSqliteSaver } from "../../src/checkpointer/saver";
import { emptyCheckpoint } from "@langchain/langgraph-checkpoint";

afterEach(cleanupDatabaseDirs);
const metadata = { parents: {}, source: "loop" as const, step: 1 };
test("database rejects cross-session input ownership and simultaneous active runs", () => {
  using db = makeDb();
  db.createSession("first", workspace);
  db.createSession("second", workspace);
  const first = db.appendUser("first", "first"),
    second = db.appendUser("second", "second");
  expect(() =>
    db.db.run(
      "INSERT INTO inputs (session_id, run_id, ordinal, content) VALUES (?, ?, 1, 'invalid')",
      ["first", runOf(db, second)],
    ),
  ).toThrow("FOREIGN KEY");
  expect(() =>
    db.db.run("INSERT INTO runs (session_id, status) VALUES ('first', 'pending')"),
  ).toThrow("UNIQUE");
  expect(() =>
    db.db.run(
      `INSERT INTO messages (session_id, source_id, input_id, message_json, created_at)
       VALUES ('first', 'invalid', ?, '{"type":"human","content":"invalid"}', 0)`,
      [second],
    ),
  ).toThrow("FOREIGN KEY");
  expect(db.pendingInputs("first").map(({ id }) => id)).toEqual([first]);
  expect(db.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
});
test("deleting a session cascades checkpoints and writes without touching another session", async () => {
  using db = makeDb();
  const saver = new BunSqliteSaver(db.db);
  for (const sessionId of ["session_one", "sessionXone"]) {
    db.createSession(sessionId, workspace);
    db.appendUser(sessionId, "run");
    const item = required(db.nextInput(sessionId));
    db.consumeInput(sessionId, item);
    const head = await saver.put(
      { configurable: { thread_id: item.runId.toString() } },
      emptyCheckpoint(),
      metadata,
    );
    await saver.putWrites(head, [["messages", "pending"]], "task");
  }
  const remainingRun = required(db.nextInput("sessionXone")).runId;
  db.deleteSession("session_one");
  for (const table of ["runs", "inputs", "messages", "checkpoints", "checkpoint_writes"]) {
    expect(db.db.query<{ count: number }, []>(`SELECT count(*) AS count FROM ${table}`).get()?.count).toBe(1);
  }
  const remaining = required(await saver.getTuple({ configurable: { thread_id: remainingRun.toString() } }));
  expect(remaining.pendingWrites).toEqual([["task", "messages", "pending"]]);
  expect(db.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
});
test("completed runs release recovery state while preserving pending input and history", async () => {
  using db = makeDb();
  db.createSession("session", workspace);
  const first = db.appendUser("session", "first"),
    item = required(db.nextInput("session"));
  db.consumeInput("session", item);
  const pending = db.appendUser("session", "next"),
    saver = new BunSqliteSaver(db.db),
    config = { configurable: { thread_id: item.runId.toString() } },
    head = await saver.put(config, emptyCheckpoint(), metadata);
  await saver.putWrites(head, [["messages", "pending"]], "task");
  db.setRunStatus(item.runId, "done");
  expect(await saver.getTuple(config)).toBeUndefined();
  expect(db.db.query("SELECT * FROM checkpoint_writes").all()).toEqual([]);
  expect(db.history("session").map(({ text }) => text)).toEqual(["first"]);
  expect(db.nextInput("session")).toMatchObject({ content: "next", id: pending, status: "pending" });
  expect(runOf(db, pending)).not.toBe(runOf(db, first));
  expect(db.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
});
