import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDatabases, makeDb, required } from "../support/database";
import { BunSqliteSaver } from "../../src/checkpointer";
import { emptyCheckpoint } from "@langchain/langgraph-checkpoint";
import { z } from "zod";

afterEach(cleanupDatabaseDirs);
const metadata = { parents: {}, source: "loop" as const, step: 1 },
  config = { configurable: { thread_id: "snapshot-isolation" } },
  messageSchema = z.tuple([z.instanceof(AIMessage), z.instanceof(ToolMessage)]);

test("cached checkpoint reads isolate message mutations and preserve recovery artifacts", async () => {
  const db = makeDb();
  try {
    const saver = new BunSqliteSaver(db.db),
      checkpoint = {
        ...emptyCheckpoint(),
        channel_values: {
          messages: [
            new AIMessage({
              content: "original",
              id: "assistant",
              tool_calls: [{ args: { input: "original" }, id: "call", name: "read" }],
            }),
            new ToolMessage({
              artifact: { structuredContent: { nested: ["original"] } },
              content: "result",
              id: "tool",
              tool_call_id: "call",
            }),
          ],
        },
      };
    await saver.put(config, checkpoint, metadata);
    const first = required(await saver.getTuple(config)),
      [assistant, tool] = messageSchema.parse(first.checkpoint.channel_values["messages"]);
    assistant.content = "mutated";
    assistant.tool_calls![0]!.args["input"] = "mutated";
    tool.artifact = { replaced: true };
    first.checkpoint.versions_seen["changed"] = { messages: 9 };
    first.metadata!.step = 999;
    const cached = required(await saver.getTuple(config)),
      restarted = required(await new BunSqliteSaver(db.db).getTuple(config));
    expect(cached).toEqual(restarted);
    const [savedAssistant, savedTool] = messageSchema.parse(
      cached.checkpoint.channel_values["messages"],
    );
    expect(savedAssistant.content).toBe("original");
    expect(savedAssistant.tool_calls![0]!.args["input"]).toBe("original");
    expect(savedTool.artifact).toEqual({ structuredContent: { nested: ["original"] } });
    expect(cached.metadata!.step).toBe(1);
  } finally {
    db.close();
  }
});

test("cached heads observe external pending writes and replacement bytes under the same ID", async () => {
  const [reader, writer] = makeDatabases(2),
    db = required(reader),
    other = required(writer);
  try {
    const saver = new BunSqliteSaver(db.db),
      external = new BunSqliteSaver(other.db),
      checkpoint = { ...emptyCheckpoint(), channel_values: { result: ["first"] } },
      head = await saver.put(config, checkpoint, metadata);
    await saver.getTuple(config);
    await external.putWrites(head, [["result", { value: "pending" }]], "task");
    const withWrite = required(await saver.getTuple(config));
    expect(withWrite.pendingWrites).toEqual([["task", "result", { value: "pending" }]]);
    withWrite.pendingWrites![0]![2] = "mutated";
    expect(required(await saver.getTuple(config)).pendingWrites).toEqual([
      ["task", "result", { value: "pending" }],
    ]);
    await external.put(
      head,
      { ...checkpoint, channel_values: { result: ["replaced"] } },
      { ...metadata, step: 2 },
    );
    const replaced = required(await saver.getTuple(config));
    expect(replaced.checkpoint.channel_values["result"]).toEqual(["replaced"]);
    expect(replaced.metadata!.step).toBe(2);
    await external.deleteThread(config.configurable.thread_id);
    expect(await saver.getTuple(config)).toBeUndefined();
  } finally {
    db.close();
    other.close();
  }
});
