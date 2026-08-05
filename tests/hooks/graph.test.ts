import { AIMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import type { HookRule } from "../../src/types";
import { HookRuntime } from "../../src/hooks/runtime";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { MockLanguageModelV4 } from "ai/test";
import { createAgentGraph } from "../../src/agent";
import { isHookCallId } from "../../src/hooks/storage/calls";
import { simulateReadableStream } from "ai";
import { testSettings } from "../support/settings";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};
afterEach(cleanupDatabaseDirs);
test("takeover hooks bracket an AI SDK tool call without recursive hooks", async () => {
  const calls: string[] = [];
  const hookTool = makeTool("hook", () => calls.push("hook"));
  const originalTool = makeTool("original", () => calls.push("original"));
  const db = makeDb();
  db.resetSession("session", workspace);
  const hooks = new HookRuntime(
    [
      rule("silent-before", "original", "before"),
      rule("before", "original", "before", "takeover"),
      rule("after", "original", "after", "takeover"),
      rule("must-not-run", "hook", "before"),
    ],
    [hookTool, originalTool],
    db.db,
    new Logger("error", true),
    "session",
    workspace,
  );
  const graph = createAgentGraph({
    checkpointer: new MemorySaver(),
    hooks,
    model: modelWithToolCall(),
    settings: testSettings(workspace),
    tools: [hookTool, originalTool],
  });
  const result = await graph.invoke(
    { hookPendingUserIds: ["queue:1"], messages: [{ content: "run", role: "user" }] },
    { configurable: { thread_id: "hook-order" } },
  );
  expect(calls).toEqual(["hook", "hook", "original", "hook"]);
  const hookIds = result.messages
    .filter((message) => AIMessage.isInstance(message))
    .flatMap((message) => message.tool_calls ?? [])
    .map((call) => call.id)
    .filter(isHookCallId);
  expect(hookIds).toHaveLength(2);
  assertToolProtocol(result.messages);
  db.close();
});
function modelWithToolCall() {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            {
              input: "{}",
              toolCallId: "original-call",
              toolName: "original",
              type: "tool-call",
            },
            { finishReason: { raw: undefined, unified: "tool-calls" }, type: "finish", usage },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { id: "text", type: "text-start" },
            { delta: "done", id: "text", type: "text-delta" },
            { id: "text", type: "text-end" },
            { finishReason: { raw: undefined, unified: "stop" }, type: "finish", usage },
          ],
        }),
      },
    ],
  });
}
function makeTool(name: string, record: () => void) {
  return tool(
    () => {
      record();
      return Promise.resolve(`${name}-result`);
    },
    { description: name, name, schema: z.object({}) },
  );
}
function rule(
  id: string,
  target: string,
  when: HookRule["when"],
  mode: HookRule["mode"] = "silent",
): HookRule {
  return { args: {}, id, mode, runLimit: -1, target, tool: "hook", when };
}
function assertToolProtocol(messages: BaseMessage[]) {
  for (const [index, message] of messages.entries()) {
    if (AIMessage.isInstance(message)) {
      for (const call of message.tool_calls ?? []) {
        const next = messages[index + 1];
        expect(next).toBeInstanceOf(ToolMessage);
        expect(ToolMessage.isInstance(next) ? next.tool_call_id : undefined).toBe(
          required(call.id),
        );
      }
    }
  }
}
