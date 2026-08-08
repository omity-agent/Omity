import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDatabases, required, workspace } from "../support/database";
import { buildTimeline } from "../../src/app/timeline";
import { loadTranscript } from "../../src/app/transcript";
import { queueMessageId } from "../../src/infrastructure/database/records/messages/history";

afterEach(cleanupDatabaseDirs);
test("模型完整行实时写入索引，最终末行只补算一次并可重新读取", async () => {
  const [writer, reader] = makeDatabases(2);
  const db = required(writer);
  const reopened = required(reader);
  const sessionId = "file-link-stream";
  db.resetSession(sessionId, workspace);
  const queueId = db.appendUser(sessionId, "question");
  db.startQueue(sessionId, required(db.nextQueue(sessionId)));
  const prefix = "查看 ./package.json";
  const first = await db.appendStream(sessionId, {
    kind: "assistant_text_delta",
    messageId: "message-1",
    partId: "text-1",
    queueId,
    value: prefix,
  });
  expect(first.fileLinks).toBeUndefined();
  expect(indexRows(db, "message-1", "content")).toEqual([]);
  const completedLine = await db.appendStream(sessionId, {
    kind: "assistant_text_delta",
    messageId: "message-1",
    partId: "text-1",
    queueId,
    value: "\n末行",
  });
  expect(completedLine.fileLinks?.[0]?.matches[0]?.path).toContain("package.json");
  const [persistedFirst] = indexRows(db, "message-1", "content");
  expect(persistedFirst).toMatchObject({ text: prefix, unit_index: 0 });
  const messages = [
    new HumanMessage({
      content: "question",
      id: queueMessageId(sessionId, queueId),
    }),
    new AIMessage({ content: `${prefix}\n末行`, id: "message-1" }),
  ];
  await db.syncHistory(sessionId, messages);
  const rows = indexRows(db, "message-1", "content");
  expect(rows).toHaveLength(2);
  expect(rows[0]?.id).toBe(persistedFirst?.id);
  const transcript = loadTranscript(reopened, sessionId);
  expect(
    transcript.fileLinks.filter(
      (unit) => unit.ownerId === "message-1" && unit.surface === "content",
    ),
  ).toHaveLength(2);
  await reopened.syncHistory(sessionId, messages);
  expect(indexRows(reopened, "message-1", "content").map(({ id }) => id)).toEqual(
    rows.map(({ id }) => id),
  );
  db.close();
  reopened.close();
});
test("格式化后的工具输入与完整工具输出由后端索引并持久化", async () => {
  const [db] = makeDatabases(1);
  const database = required(db);
  const sessionId = "file-link-tools";
  database.resetSession(sessionId, workspace);
  await database.syncHistory(sessionId, [
    new AIMessage({
      content: "",
      id: "assistant-1",
      tool_calls: [{ args: { path: "./package.json" }, id: "call-1", name: "read" }],
    }),
    new ToolMessage({
      content: "读取 ./package.json",
      id: "tool-1",
      tool_call_id: "call-1",
    }),
  ]);
  const transcript = loadTranscript(database, sessionId);
  const surfaces = transcript.fileLinks
    .filter((unit) => unit.ownerId === "call-1")
    .map(({ surface }) => surface);
  expect(surfaces).toContain("tool_input");
  expect(surfaces).toContain("tool_output");
  const tool = buildTimeline(
    transcript.messages,
    transcript.queue,
    transcript.events,
    [],
    transcript.fileLinks,
  )
    .flatMap(({ parts }) => parts)
    .find((part) => part.type === "tool");
  expect(tool?.type === "tool" ? tool.call.fileLinks?.[0]?.path : undefined).toContain(
    "package.json",
  );
  expect(tool?.type === "tool" ? tool.output?.fileLinks?.[0]?.path : undefined).toContain(
    "package.json",
  );
  database.close();
});
function indexRows(db: ReturnType<typeof makeDatabases>[number], ownerId: string, surface: string) {
  return db.db
    .query<{ id: number; text: string; unit_index: number }, [string, string]>(
      `SELECT id, text, unit_index FROM file_link_units
       WHERE owner_id = ? AND surface = ? ORDER BY unit_index`,
    )
    .all(ownerId, surface);
}
