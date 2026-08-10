import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { HookRuntime } from "../../src/hooks/runtime";
import { Logger } from "../../src/infrastructure/logging/logger";
import { toModelMessages } from "../../src/agent/aiMessages";
import { z } from "zod";

afterEach(cleanupDatabaseDirs);
test("HookRuntime enforces Drizzle-backed limits and resolves arguments", async () => {
  const received: unknown[] = [],
    tool = new DynamicStructuredTool({
      description: "capture",
      func: (input) => {
        received.push(input);
        return Promise.resolve("captured");
      },
      name: "capture",
      schema: z.object({ cwd: z.string(), previous: z.string() }),
    }),
    db = makeDb();
  db.resetSession("session", workspace);
  const hooks = new HookRuntime(
      [
        {
          args: { cwd: `\${cwd}`, previous: `\${toolOutputs.fromEnd.1.output}` },
          id: "capture-once",
          mode: "takeover",
          runLimit: 1,
          target: "agent",
          tool: "capture",
          when: "after",
        },
      ],
      [tool],
      db.db,
      new Logger("error", true),
      "session",
      workspace,
    ),
    outputs = [{ output: "previous" }],
    [rule] = hooks.matching("agent", "after");
  if (!rule) {
    throw new Error("测试 Hook 不存在");
  }
  const options = {
      consume: (id: string, limit: number) => Promise.resolve(hooks.consume(id, limit)),
      invoke: async (call: ReturnType<HookRuntime["resolvedCall"]>) => {
        const value: unknown = await tool.invoke(tool.schema.parse(call.args));
        return new ToolMessage({
          content: ToolMessage.isInstance(value) ? value.content : String(value),
          name: call.name,
          tool_call_id: call.id,
        });
      },
      toolOutputs: outputs,
    },
    first = await hooks.execute(rule, "message", "thread", options),
    second = await hooks.execute(rule, "message", "thread", options);
  expect(first?.value).toEqual({ output: "captured" });
  expect(second).toBeNull();
  expect(received).toEqual([{ cwd: workspace.replaceAll("\\", "/"), previous: "previous" }]);
  db.close();
});
test("free-form Hook calls retain custom string input for model messages", () => {
  const tool = new DynamicStructuredTool({
      description: "patch",
      func: () => Promise.resolve("patched"),
      name: "patch",
      schema: z.object({ patch: z.string() }),
    }),
    db = makeDb();
  db.resetSession("session", workspace);
  const hooks = new HookRuntime(
      [],
      [tool],
      db.db,
      new Logger("error", true),
      "session",
      workspace,
      undefined,
      new Map([["patch", "patch"]]),
    ),
    call = hooks.resolvedCall(
      {
        args: { input: "*** Begin Patch" },
        id: "patch-hook",
        mode: "takeover",
        runLimit: -1,
        target: "agent",
        tool: "patch",
        when: "before",
      },
      "message",
      "thread",
      [],
    );
  expect(toModelMessages([new AIMessage({ content: "", tool_calls: [call] })])).toEqual([
    {
      content: [
        {
          input: "*** Begin Patch",
          toolCallId: call.id,
          toolName: "patch",
          type: "tool-call",
        },
      ],
      role: "assistant",
    },
  ]);
  db.close();
});
