import { expect, test } from "bun:test";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createToolInvoker } from "../../src/agent/toolExecution";
import { readToolOutput } from "../../src/hooks/storage/outputs";
import { resolveHookArgs } from "../../src/hooks/variables";
import { testSettings } from "../support/settings";
import { z } from "zod";

test("structured tool artifacts remain available to Hook output references", async () => {
  const tool = new DynamicStructuredTool({
      description: "structured",
      func: async ({ value }) => [value, [{ data: { id: 42 }, type: "mcp_structured_content" }]],
      name: "structured",
      responseFormat: "content_and_artifact",
      schema: z.object({ value: z.string() }),
    }),
    invoke = createToolInvoker([tool], {
      freeformToolParameters: new Map(),
      sessionId: "session",
      settings: testSettings(),
    }),
    output = await invoke(
      { args: { value: "ok" }, id: "call", name: "structured", type: "tool_call" },
      { configurable: { thread_id: "thread" } },
    );
  expect(
    resolveHookArgs(
      { value: `\${toolOutputs.fromEnd.1.structuredOutput.id}` },
      { cwd: "F:/tmp", toolOutputs: [readToolOutput(output)] },
    ),
  ).toEqual({ value: 42 });
});
test.each([true, false])(
  "tool invocation trims trailing blank lines only for Freeform inputs: %j",
  async (freeform) => {
    const content = "\n  first\n\n  second  \t",
      input = `${content}\r\n \t\r\n`,
      received: string[] = [],
      tool = new DynamicStructuredTool({
        description: "capture input",
        func: async ({ source }) => {
          received.push(source);
          return "ok";
        },
        name: "capture",
        schema: z.object({ source: z.string() }),
      }),
      invoke = createToolInvoker([tool], {
        freeformToolParameters: new Map(freeform ? [["capture", "source"]] : []),
        sessionId: "session",
        settings: testSettings(),
      });
    await invoke(
      {
        args: freeform ? { input } : { source: input },
        id: "call",
        name: "capture",
        type: "tool_call",
      },
      { configurable: { thread_id: "thread" } },
    );
    expect(received).toEqual([freeform ? content : input]);
  },
);
