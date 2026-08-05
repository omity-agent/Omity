import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MockLanguageModelV4 } from "ai/test";
import { createAgentGraph } from "../../src/agent";
import { processQueue } from "../../src/runtime/queue";
import { simulateReadableStream } from "ai";
import { testSettings } from "../support/settings";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};
afterEach(cleanupDatabaseDirs);
test("a paused run resumes from the model boundary without repeating the model call", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  db.appendUser("session", "run tool");
  const calls: string[] = [];
  const echo = tool(
    () => {
      calls.push("tool");
      return Promise.resolve("echoed");
    },
    { description: "echo", name: "echo", schema: z.object({}) },
  );
  const model = modelWithToolCall();
  const saver = new BunSqliteSaver(db.db);
  const hooks = new HookRuntime([], [echo], db.db, new Logger("error", true), "session", workspace);
  const graph = createAgentGraph({
    checkpointer: saver,
    hooks,
    model,
    settings: testSettings(workspace),
    tools: [echo],
  });
  const stopping = new AbortController();
  const pausedContext = context(db, saver, graph, stopping.signal);
  pausedContext.observer = {
    changed: () => {
      if (model.doStreamCalls.length === 1) {
        stopping.abort();
      }
    },
    token: () => undefined,
  };
  await processQueue(pausedContext, required(db.nextQueue("session")));
  expect(db.nextQueue("session")?.status).toBe("paused");
  expect(model.doStreamCalls).toHaveLength(1);
  expect(calls).toEqual([]);
  db.setControl("session", "running");
  await processQueue(context(db, saver, graph), required(db.nextQueue("session")));
  expect(db.nextQueue("session")).toBeNull();
  expect(model.doStreamCalls).toHaveLength(2);
  expect(calls).toEqual(["tool"]);
  db.close();
});
function context(
  db: ReturnType<typeof makeDb>,
  checkpointer: BunSqliteSaver,
  graph: ReturnType<typeof createAgentGraph>,
  stopping?: AbortSignal,
): HostContext {
  return {
    checkpointer,
    controller: new AbortController(),
    db,
    graph,
    logger: new Logger("error", true),
    sessionId: "session",
    settings: testSettings(workspace),
    stopping,
  };
}
function modelWithToolCall() {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            {
              input: "{}",
              toolCallId: "echo-call",
              toolName: "echo",
              type: "tool-call",
            },
            { finishReason: { raw: undefined, unified: "tool-calls" }, type: "finish", usage },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { id: "answer", type: "text-start" },
            { delta: "done", id: "answer", type: "text-delta" },
            { id: "answer", type: "text-end" },
            { finishReason: { raw: undefined, unified: "stop" }, type: "finish", usage },
          ],
        }),
      },
    ],
  });
}
