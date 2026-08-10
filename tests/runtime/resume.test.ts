import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MockLanguageModelV4 } from "ai/test";
import { createAgentGraph } from "../../src/agent";
import { processQueue } from "../../src/runtime/queue";
import { queryAll } from "../../src/infrastructure/database/connection";
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
  const model = modelWithToolCalls();
  const saver = new BunSqliteSaver(db.db);
  const hooks = new HookRuntime([], [echo], db.db, new Logger("error", true), "session", workspace);
  const graph = createAgentGraph({
    checkpointer: saver,
    hooks,
    model,
    settings: testSettings(),
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
  expect(calls).toEqual(["tool", "tool"]);
  db.close();
});
test("a paused run steps through one model request or a complete tool batch", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  db.appendUser("session", "run tool");
  const calls: string[] = [];
  const invoked = Promise.withResolvers<string>();
  const release = Promise.withResolvers<string>();
  const echo = tool(
    (_, config) => {
      const callId = config.toolCall?.id;
      calls.push(callId ?? "missing");
      invoked.resolve(callId ?? "missing");
      return release.promise;
    },
    { description: "echo", name: "echo", schema: z.object({}) },
  );
  const model = modelWithToolCalls();
  const saver = new BunSqliteSaver(db.db);
  const hooks = new HookRuntime([], [echo], db.db, new Logger("error", true), "session", workspace);
  const graph = createAgentGraph({
    checkpointer: saver,
    hooks,
    model,
    settings: testSettings(),
    tools: [echo],
  });
  db.setControl("session", "step");
  await processQueue(stepContext(db, saver, graph), required(db.nextQueue("session")));
  expect(db.nextQueue("session")?.status).toBe("paused");
  expect(db.control("session")).toBe("pause");
  expect(model.doStreamCalls).toHaveLength(1);
  expect(calls).toEqual([]);
  db.setControl("session", "step");
  const toolStep = processQueue(stepContext(db, saver, graph), required(db.nextQueue("session")));
  expect(await invoked.promise).toBe("echo-call-1");
  expect(
    queryAll<{ kind: string }>(
      db.db,
      `SELECT kind FROM events
       WHERE kind IN ('tool_started', 'tool_finished')
       ORDER BY id`,
    ).map(({ kind }) => kind),
  ).toEqual(["tool_started", "tool_started"]);
  expect(calls).toEqual(["echo-call-1", "echo-call-2"]);
  release.resolve("echoed");
  await toolStep;
  expect(db.nextQueue("session")?.status).toBe("paused");
  expect(db.control("session")).toBe("pause");
  expect(model.doStreamCalls).toHaveLength(1);
  expect(calls).toEqual(["echo-call-1", "echo-call-2"]);
  expect(
    queryAll<{ kind: string }>(
      db.db,
      `SELECT kind FROM events
       WHERE kind IN ('tool_started', 'tool_finished')
       ORDER BY id`,
    ).map(({ kind }) => kind),
  ).toEqual(["tool_started", "tool_started", "tool_finished", "tool_finished"]);
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
    settings: testSettings(),
    stopping,
  };
}
function stepContext(
  db: ReturnType<typeof makeDb>,
  checkpointer: BunSqliteSaver,
  graph: ReturnType<typeof createAgentGraph>,
) {
  const stopping = new AbortController();
  const ctx = context(db, checkpointer, graph, stopping.signal);
  ctx.observer = {
    changed: () => {
      if (db.nextQueue("session")?.status === "paused") {
        stopping.abort();
      }
    },
    token: () => undefined,
  };
  return ctx;
}
function modelWithToolCalls() {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            {
              input: "{}",
              toolCallId: "echo-call-1",
              toolName: "echo",
              type: "tool-call",
            },
            {
              input: "{}",
              toolCallId: "echo-call-2",
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
