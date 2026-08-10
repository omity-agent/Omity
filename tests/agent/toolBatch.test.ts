import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { expect, test } from "bun:test";
import { invokeToolBatch, pendingToolBatch } from "../../src/agent/graph/toolBatch";

const calls = [
  { args: {}, id: "first", name: "read", type: "tool_call" as const },
  { args: {}, id: "second", name: "search", type: "tool_call" as const },
];
test("selects all pending calls only when parallel execution is enabled", () => {
  const messages = [
    new AIMessage({ content: "", tool_calls: calls }),
    new ToolMessage({ content: "done", tool_call_id: "first" }),
  ];
  expect(pendingToolBatch(messages, true).map(({ id }) => id)).toEqual(["second"]);
  expect(
    pendingToolBatch([new AIMessage({ content: "", tool_calls: calls })], false).map(
      ({ id }) => id,
    ),
  ).toEqual(["first"]);
});
test("invokes a tool batch concurrently and preserves result order", async () => {
  let active = 0,
    maximumActive = 0;
  const release = Promise.withResolvers<void>(),
    execution = invokeToolBatch(calls, async (call) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await release.promise;
      active -= 1;
      return call.id;
    });
  await Promise.resolve();
  expect(maximumActive).toBe(2);
  release.resolve();
  expect(await execution).toEqual(["first", "second"]);
});
