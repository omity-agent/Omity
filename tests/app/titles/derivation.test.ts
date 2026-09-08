import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../../support/database";
import { cancelledToolMessage } from "../../../src/runtime/toolOutput";
import { deriveSessionTitle } from "../../../src/infrastructure/database/records/messages/deriveTitle";
import { recordedTitle } from "./recordedCalls";
import { runTransaction } from "../../../src/infrastructure/database/connection";
import { storeMessage } from "../../../src/infrastructure/database/records/messages/history";

afterEach(cleanupDatabaseDirs);
test("titles require a committed successful result", async () => {
  const db = makeDb();
  try {
    db.createSession("session", workspace);
    expect(deriveSessionTitle(db.db, "session")).toBe("session");
    const [request, result] = await recordedTitle("  首个有效标题  ");
    await db.syncHistory("session", [request]);
    expect(deriveSessionTitle(db.db, "session")).toBe("session");
    storeMessage(db.db, "session", result);
    expect(deriveSessionTitle(db.db, "session")).toBe("session");
    await db.syncHistory("session", [request, result]);
    expect(deriveSessionTitle(db.db, "session")).toBe("首个有效标题");
    expect(deriveSessionTitle(db.db, "another-session")).toBe("another-session");
  } finally {
    db.close();
  }
});
test("failed, canceled, pending and unrelated calls do not replace the latest successful title", async () => {
  const db = makeDb();
  try {
    db.createSession("session", workspace);
    const first = await recordedTitle("已经完成的标题"),
      invalid = await recordedTitle(""),
      [canceledRequest, canceledResult] = await recordedTitle("不应采用的标题"),
      [pending] = await recordedTitle("尚未完成的标题"),
      unrelated = [
        new AIMessage({
          content: "",
          tool_calls: [
            { args: { title: "其他工具的标题" }, id: "unrelated", name: "update_title" },
          ],
        }),
        new ToolMessage({ content: "ok", name: "update_title", tool_call_id: "unrelated" }),
      ],
      canceled = cancelledToolMessage(canceledResult.tool_call_id, 100, canceledResult.name);
    canceled.metadata = { builtInTool: "update_title" };
    await db.syncHistory("session", [
      ...first,
      ...invalid,
      canceledRequest,
      canceled,
      pending,
      ...unrelated,
    ]);
    expect(deriveSessionTitle(db.db, "session")).toBe("已经完成的标题");
    await db.syncHistory("session", db.history("session"));
    expect(deriveSessionTitle(db.db, "session")).toBe("已经完成的标题");
  } finally {
    db.close();
  }
});
test("title order follows message positions and call order instead of row IDs or completion order", async () => {
  const db = makeDb();
  try {
    db.createSession("session", workspace);
    const [first, firstResult] = await recordedTitle("第一顺位的标题"),
      [last, lastResult] = await recordedTitle("最后顺位的标题"),
      batch = new AIMessage({
        content: "",
        tool_calls: [...first.tool_calls!, ...last.tool_calls!],
      });
    storeMessage(db.db, "session", lastResult, 2, undefined, 1);
    storeMessage(db.db, "session", firstResult, 1, undefined, 100);
    storeMessage(db.db, "session", batch, 0, undefined, 500);
    expect(deriveSessionTitle(db.db, "session")).toBe("最后顺位的标题");
    await db.syncHistory("session", [batch, lastResult, firstResult]);
    expect(deriveSessionTitle(db.db, "session")).toBe("最后顺位的标题");
    await db.syncHistory("session", [last, lastResult, first, firstResult]);
    expect(deriveSessionTitle(db.db, "session")).toBe("第一顺位的标题");
  } finally {
    db.close();
  }
});
test("renamed and freeform title calls remain identifiable without reading current settings", async () => {
  const db = makeDb();
  try {
    db.createSession("session", workspace);
    const renamed = await recordedTitle("改名工具的标题", { name: "custom_heading" });
    await db.syncHistory("session", [...renamed]);
    expect(deriveSessionTitle(db.db, "session")).toBe("改名工具的标题");
    const freeform = await recordedTitle("  自由输入的标题  ", {
      freeform: true,
      name: "freeform_heading",
    });
    await db.syncHistory("session", [...db.history("session"), ...freeform]);
    expect(deriveSessionTitle(db.db, "session")).toBe("自由输入的标题");
    await db.syncHistory("session", []);
    expect(deriveSessionTitle(db.db, "session")).toBe("session");
  } finally {
    db.close();
  }
});
test("matching requires the same session, call ID, tool name and a preceding request", async () => {
  const db = makeDb();
  try {
    db.createSession("session", workspace);
    db.createSession("other", workspace);
    const [request, result] = await recordedTitle("不会被误用标题");
    await db.syncHistory("session", [request]);
    await db.syncHistory("other", [result]);
    expect(deriveSessionTitle(db.db, "session")).toBe("session");
    await db.syncHistory("session", [result, request]);
    expect(deriveSessionTitle(db.db, "session")).toBe("session");
    result.name = "different";
    await db.syncHistory("session", [request, result]);
    expect(deriveSessionTitle(db.db, "session")).toBe("session");
    result.name = request.tool_calls![0]!.name;
    result.tool_call_id = "different";
    await db.syncHistory("session", [request, result]);
    expect(deriveSessionTitle(db.db, "session")).toBe("session");
  } finally {
    db.close();
  }
});
test("a successful title record with invalid arguments fails explicitly", async () => {
  const db = makeDb();
  try {
    db.createSession("session", workspace);
    const [request, result] = await recordedTitle("有效标题被损坏");
    request.tool_calls![0]!.args = { title: 42 };
    await db.syncHistory("session", [request, result]);
    expect(() => deriveSessionTitle(db.db, "session")).toThrow();
  } finally {
    db.close();
  }
});
test("long histories of unrelated tool calls do not trigger repeated full-message scans", async () => {
  const db = makeDb();
  try {
    db.createSession("session", workspace);
    const pair = await recordedTitle("长会话保留的标题");
    runTransaction(db.db, () => {
      for (const [index, message] of pair.entries()) {
        storeMessage(db.db, "session", message, index);
      }
      for (let index = 0; index < 5000; index += 1) {
        const id = `other-${index.toString()}`;
        storeMessage(
          db.db,
          "session",
          new AIMessage({
            content: "",
            tool_calls: [{ args: {}, id, name: "other" }],
          }),
          index * 2 + 2,
        );
        storeMessage(
          db.db,
          "session",
          new ToolMessage({
            content: "ok",
            name: "other",
            tool_call_id: id,
          }),
          index * 2 + 3,
        );
      }
    });
    const started = performance.now();
    expect(deriveSessionTitle(db.db, "session")).toBe("长会话保留的标题");
    expect(performance.now() - started).toBeLessThan(2000);
  } finally {
    db.close();
  }
});
