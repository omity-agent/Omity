import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, runOf, workspace } from "../support/database";
import { inputMessageId } from "../../src/infrastructure/database/records/transcript/messages/history";

afterEach(cleanupDatabaseDirs);
test("replace history restores queue ids from user message identity", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const first = db.appendUser("123", "第一条");
  db.consumeInput("123", required(db.nextInput("123")));
  db.setRunStatus(runOf(db, first), "done");
  const second = db.appendUser("123", "第二条");
  await db.syncHistory("123", [
    new HumanMessage({
      content: "第一条",
      id: inputMessageId("123", first),
    }),
    new AIMessage("中间响应"),
    new HumanMessage({
      content: "第二条",
      id: inputMessageId("123", second),
    }),
    new AIMessage("最终响应"),
  ]);
  const rows = db.db
    .query<{ input_id: number | null }, []>("SELECT input_id FROM messages ORDER BY id")
    .all();
  expect(rows.map((row) => row.input_id)).toEqual([first, null, second, null]);
  db.close();
});
test("replacing a queued message body moves its queue identity", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const inputId = db.appendUser("123", "旧正文");
  db.consumeInput("123", required(db.nextInput("123")));
  await db.syncHistory("123", [
    new HumanMessage({
      content: "新正文",
      id: inputMessageId("123", inputId),
    }),
  ]);
  expect(db.history("123").map((message) => message.text)).toEqual(["新正文"]);
  expect(
    db.db
      .query<{ count: number }, [number]>(
        "SELECT COUNT(*) AS count FROM messages WHERE input_id = ?",
      )
      .get(inputId)?.count,
  ).toBe(1);
  db.close();
});
test("replace history rejects queue identities from another session", async () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  expect(
    db.syncHistory("123", [
      new HumanMessage({ content: "错误消息", id: inputMessageId("456", 1) }),
    ]),
  ).rejects.toThrow("用户消息属于其他会话");
  db.close();
});
test("append during active run belongs to that run", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const first = db.appendUser("123", "第一条"),
    second = db.appendUser("123", "第二条"),
    rows = db.db
      .query<{ id: number; run_id: number }, []>("SELECT id, run_id FROM inputs ORDER BY id")
      .all(),
    runId = runOf(db, first);
  expect(rows).toEqual([
    { id: first, run_id: runId },
    { id: second, run_id: runId },
  ]);
  db.close();
});
test("reset cascades to runs and their inputs", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  db.appendUser("123", "第一条");
  db.appendUser("123", "第二条");
  db.resetSession("123", workspace);
  const row = db.db.query<{ count: number }, []>("SELECT COUNT(*) count FROM inputs").get();
  expect(row?.count).toBe(0);
  expect(db.db.query<{ count: number }, []>("SELECT COUNT(*) count FROM runs").get()?.count).toBe(
    0,
  );
  db.close();
});
test("finishing a run carries unconsumed inputs into a new run", () => {
  const db = makeDb();
  db.resetSession("123", workspace);
  const first = db.appendUser("123", "第一条"),
    second = db.appendUser("123", "第二条");
  db.consumeInput("123", required(db.nextInput("123")));
  const firstRun = runOf(db, first);
  db.setRunStatus(firstRun, "done");
  expect(db.runStatus(firstRun)).toBe("done");
  expect(runOf(db, second)).not.toBe(firstRun);
  const third = db.appendUser("123", "第三条");
  expect(runOf(db, third)).toBe(runOf(db, second));
  db.consumeInput("123", required(db.nextInput("123")));
  db.consumeInput("123", required(db.pendingInputs("123")[0]));
  db.setRunStatus(runOf(db, third), "done");
  const fourth = db.appendUser("123", "第四条");
  expect(runOf(db, fourth)).not.toBe(runOf(db, third));
  db.close();
});
