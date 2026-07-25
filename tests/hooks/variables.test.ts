import { expect, test } from "bun:test";
import { AIMessage } from "@langchain/core/messages";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import type { HookRule } from "../../src/types";
import { HookRuntime } from "../../src/hooks/runtime";
import { Logger } from "../../src/infrastructure/logging/logger";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { createAgentGraph } from "../../src/agent";
import { createTestDirectory } from "../support/artifacts";
import { fakeModel } from "@langchain/core/testing";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { testSettings } from "../support/settings";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

test("mixed hook modes retain indexed outputs across unhooked tools", async () => {
  const dir = createTestDirectory("hook-variables");
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  const received: Record<string, unknown>[] = [];
  const hookTool = tool(
    (args) => {
      received.push(args);
      return Promise.resolve(`${args.label}-result`);
    },
    {
      description: "hook",
      name: "hook",
      schema: z
        .object({
          history: z.array(z.unknown()).optional(),
          label: z.string(),
        })
        .strict(),
    },
  );
  const originalTool = tool(() => Promise.resolve("original-result"), {
    description: "original",
    name: "original",
    schema: z.object({}),
  });
  let plainCalls = 0;
  const plainTool = tool(() => Promise.resolve(`plain-${(++plainCalls).toString()}-result`), {
    description: "plain",
    name: "plain",
    schema: z.object({}),
  });
  const hooks = new HookRuntime(
    rules(),
    [hookTool, originalTool, plainTool],
    db.db,
    new Logger("error", true),
    "session",
    dir,
  );
  try {
    const agent = createAgentGraph({
      checkpointer: new MemorySaver(),
      hooks,
      model: fakeModel()
        .respond(
          new AIMessage({
            content: "",
            id: "model-tools",
            tool_calls: [
              { args: {}, id: "plain-call-1", name: "plain" },
              { args: {}, id: "plain-call-2", name: "plain" },
              { args: {}, id: "original-call", name: "original" },
            ],
          }),
        )
        .respond(new AIMessage("done")),
      settings: testSettings(dir),
      tools: [hookTool, originalTool, plainTool],
    });
    const result = await agent.invoke(
      {
        hookPendingUserIds: ["queue:1"],
        messages: [{ content: "run", role: "user" }],
      },
      { configurable: { thread_id: "thread" } },
    );
    expect(received).toEqual([
      { label: "agent-start" },
      { label: "before-silent" },
      {
        history: ["agent-start-result", "before-silent-result"],
        label: "before-takeover",
      },
      {
        history: ["agent-start-result", "original-result"],
        label: "after-silent",
      },
      {
        history: ["plain-1-result", "original-result", "after-silent-result"],
        label: "after-takeover",
      },
      {
        history: [
          "agent-start-result",
          "plain-1-result",
          "plain-2-result",
          "after-takeover-result",
        ],
        label: "agent-end",
      },
    ]);
    expect(result.messages.slice(-2).map((message) => message.type)).toEqual(["ai", "tool"]);
  } finally {
    db.close();
    rmSync(dir, { force: true, recursive: true });
  }
});
function rules(): HookRule[] {
  return [
    hookRule("agent-start", "before", "silent", { label: "agent-start" }, "agent"),
    hookRule("before-silent", "before", "silent", {
      label: "before-silent",
    }),
    hookRule("before-takeover", "before", "takeover", {
      history: [`\${toolOutputs.fromStart.1.output}`, `\${toolOutputs.fromEnd.1.output}`],
      label: "before-takeover",
    }),
    hookRule("after-silent", "after", "silent", {
      history: [`\${toolOutputs.fromStart.1.output}`, `\${toolOutputs.fromEnd.1.output}`],
      label: "after-silent",
    }),
    hookRule("after-takeover", "after", "takeover", {
      history: [
        `\${toolOutputs.fromStart.2.output}`,
        `\${toolOutputs.fromEnd.2.output}`,
        `\${toolOutputs.fromEnd.1.output}`,
      ],
      label: "after-takeover",
    }),
    hookRule(
      "agent-end",
      "after",
      "takeover",
      {
        history: [
          `\${toolOutputs.fromStart.1.output}`,
          `\${toolOutputs.fromStart.2.output}`,
          `\${toolOutputs.fromStart.3.output}`,
          `\${toolOutputs.fromEnd.1.output}`,
        ],
        label: "agent-end",
      },
      "agent",
    ),
  ];
}
function hookRule(
  id: string,
  when: HookRule["when"],
  mode: HookRule["mode"],
  args: Record<string, unknown>,
  target: HookRule["target"] = "original",
): HookRule {
  return {
    args,
    id,
    mode,
    runLimit: -1,
    target,
    tool: "hook",
    when,
  };
}
