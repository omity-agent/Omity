import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../../support/database";
import { deriveSessionTitle } from "../../../src/infrastructure/database/records/messages/deriveTitle";
import { forkDatabaseBeforeMessage } from "../../../src/app/fork";
import { queryGet } from "../../../src/infrastructure/database/connection";
import { recordedTitle } from "./recordedCalls";

afterEach(cleanupDatabaseDirs);
test("fork derives its historical title and future title changes stay independent", async () => {
  const source = makeDb(),
    target = makeDb();
  try {
    source.createSession("source", workspace);
    const historical = await recordedTitle("分叉之前的标题", { name: "renamed_heading" }),
      failed = await recordedTitle(""),
      latest = await recordedTitle("原会话最新标题");
    await source.syncHistory("source", [
      new HumanMessage("首条问题"),
      ...historical,
      ...failed,
      new HumanMessage("分叉位置"),
      ...latest,
    ]);
    forkAt(source, target, 5);
    expect(deriveSessionTitle(source.db, "source")).toBe("原会话最新标题");
    expect(deriveSessionTitle(target.db, "target")).toBe("分叉之前的标题");
    const results = target.history("target").filter((message) => ToolMessage.isInstance(message));
    expect(results.map(({ status }) => status)).toEqual(["success", "error"]);
    expect(results[0]?.metadata).toMatchObject({ builtInTool: "update_title" });
    await target.syncHistory("target", [
      ...target.history("target"),
      ...(await recordedTitle("分叉独立的新标题", { freeform: true })),
    ]);
    expect(deriveSessionTitle(target.db, "target")).toBe("分叉独立的新标题");
    expect(deriveSessionTitle(source.db, "source")).toBe("原会话最新标题");
    await source.syncHistory("source", [
      ...source.history("source"),
      ...(await recordedTitle("原会话再次改标题")),
    ]);
    expect(deriveSessionTitle(source.db, "source")).toBe("原会话再次改标题");
    expect(deriveSessionTitle(target.db, "target")).toBe("分叉独立的新标题");
  } finally {
    source.close();
    target.close();
  }
});
test.each(["absent", "pending", "failed"] as const)(
  "fork uses its own ID when retained title calls are %s",
  async (state) => {
    const source = makeDb(),
      target = makeDb();
    try {
      source.createSession("source", workspace);
      const pair = await recordedTitle(state === "failed" ? "" : "分叉后才有标题"),
        retained = state === "absent" ? [] : state === "pending" ? [pair[0]] : [...pair],
        prefix = [new HumanMessage("首条问题"), ...retained];
      await source.syncHistory("source", [
        ...prefix,
        new HumanMessage("分叉位置"),
        ...(state === "pending" ? [pair[1]] : []),
        ...(await recordedTitle("原会话有效标题")),
      ]);
      forkAt(source, target, prefix.length);
      expect(deriveSessionTitle(source.db, "source")).toBe("原会话有效标题");
      expect(deriveSessionTitle(target.db, "target")).toBe("target");
    } finally {
      source.close();
      target.close();
    }
  },
);
function forkAt(
  source: ReturnType<typeof makeDb>,
  target: ReturnType<typeof makeDb>,
  position: number,
) {
  const { id } = required(
    queryGet<{ id: number }>(
      source.db,
      "SELECT id FROM messages WHERE session_id = ? AND position = ?",
      "source",
      position,
    ),
  );
  forkDatabaseBeforeMessage({
    beforeMessageId: id,
    profiles: [],
    source,
    sourceSessionId: "source",
    target,
    targetSessionId: "target",
    workspace,
  });
}
