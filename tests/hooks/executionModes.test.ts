import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import type { HookRule } from "../../src/types";
import { HookRuntime } from "../../src/hooks/runtime";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { MockLanguageModelV4 } from "ai/test";
import { createAgentGraph } from "../../src/agent";
import { simulateReadableStream } from "ai";
import { testSettings } from "../support/settings";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};
afterEach(cleanupDatabaseDirs);
test.each([
  { enabled: true, parallel: true },
  { enabled: true, parallel: false },
  { enabled: false, parallel: true },
  { enabled: false, parallel: false },
])(
  "preserves tool ordering and concurrency with hook configuration %j",
  async ({ enabled, parallel }) => {
    const events: string[] = [];
    let active = 0,
      maximumActive = 0;
    const hookTool = tool(
        ({ label }) => {
          events.push(label);
          return Promise.resolve(label);
        },
        { description: "hook", name: "hook", schema: z.object({ label: z.string() }) },
      ),
      originals = ["first", "second"].map((name) =>
        tool(
          async () => {
            events.push(`start-${name}`);
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            await Bun.sleep(10);
            active -= 1;
            events.push(`end-${name}`);
            return name;
          },
          { description: name, name, schema: z.object({}) },
        ),
      ),
      db = makeDb();
    db.resetSession("session", workspace);
    const hooks = new HookRuntime(
        hookRules(enabled),
        [hookTool, ...originals],
        db.db,
        new Logger("error", true),
        "session",
        workspace,
      ),
      graph = createAgentGraph({
        checkpointer: new MemorySaver(),
        hooks,
        model: modelWithParallelCalls(),
        settings: { ...testSettings(), toolExecution: { parallel } },
        tools: [hookTool, ...originals],
      }),
      result = await graph.invoke(
        { hookPendingUserIds: ["queue:1"], messages: [{ content: "run", role: "user" }] },
        { configurable: { thread_id: "parallel-hooks" } },
      );
    expect(maximumActive).toBe(parallel ? 2 : 1);
    if (parallel && enabled) {
      expect(events.slice(0, 2)).toEqual(["before-first", "before-second"]);
      expect(events.slice(-2)).toEqual(["after-first", "after-second"]);
    } else if (!parallel) {
      expect(events).toEqual(
        ["first", "second"].flatMap((name) =>
          enabled
            ? [`before-${name}`, `start-${name}`, `end-${name}`, `after-${name}`]
            : [`start-${name}`, `end-${name}`],
        ),
      );
    }
    const outputs = result.messages.filter((message) => ToolMessage.isInstance(message));
    expect(outputs.map((message) => message.tool_call_id)).toEqual(["first-call", "second-call"]);
    for (const [index, message] of result.messages.entries()) {
      if (AIMessage.isInstance(message) && message.tool_calls?.length) {
        const callIds = message.tool_calls.map((call) => call.id);
        expect(
          result.messages
            .slice(index + 1, index + 1 + callIds.length)
            .map((output) => (ToolMessage.isInstance(output) ? output.tool_call_id : undefined)),
        ).toEqual(callIds);
      }
    }
    db.close();
  },
);
function hookRules(enable: boolean): HookRule[] {
  return ["first", "second"].flatMap((target) => [
    {
      args: { label: `before-${target}` },
      enable,
      id: `before-${target}`,
      mode: "silent",
      runLimit: -1,
      target,
      tool: "hook",
      when: "before",
    },
    {
      args: { label: `after-${target}` },
      enable,
      id: `after-${target}`,
      mode: "silent",
      runLimit: -1,
      target,
      tool: "hook",
      when: "after",
    },
  ]);
}
function modelWithParallelCalls() {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            {
              input: "{}",
              toolCallId: "first-call",
              toolName: "first",
              type: "tool-call",
            },
            {
              input: "{}",
              toolCallId: "second-call",
              toolName: "second",
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
