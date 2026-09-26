import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../../support/database";
import type { ModelMessage } from "ai";
import { buildTimeline } from "../../../src/app/timeline";
import { fromModelMessages } from "../../../src/agent/fromAiMessages";
import { loadTranscript } from "../../../src/app/transcript";

type Part = Exclude<Extract<ModelMessage, { role: "assistant" }>["content"], string>[number];
const first: Part = { text: "正文一", type: "text" },
  second: Part = { text: "正文二", type: "text" },
  third: Part = { text: "正文三", type: "text" },
  reasoning: Part = { text: "思考", type: "reasoning" },
  tool: Part = {
    input: {},
    providerExecuted: true,
    toolCallId: "hosted",
    toolName: "inspect",
    type: "tool-call",
  };
const cases: { expected: string; parts: Part[] }[] = [
  { expected: "正文一正文二", parts: [first, second] },
  { expected: "正文二", parts: [first, tool, reasoning, second] },
  { expected: "正文二正文三", parts: [first, reasoning, second, third] },
  { expected: "正文一正文二", parts: [first, second, reasoning] },
];
afterEach(cleanupDatabaseDirs);
test.each(cases)(
  "persisted copy respects body boundaries: $expected",
  async ({ expected, parts }) => {
    using db = makeDb();
    db.createSession("selection", workspace);
    const source = fromModelMessages([{ content: parts, role: "assistant" }], "response");
    await db.syncHistory("selection", source);
    const snapshot = loadTranscript(db, "selection"),
      [message] = buildTimeline(snapshot.messages, [], []);
    expect(message?.copyContent ?? message?.content).toBe(expected);
    expect(
      message?.parts.flatMap((part) => (part.type === "content" ? [part.content] : [])),
    ).toEqual(parts.flatMap((part) => (part.type === "text" ? [part.text] : [])));
  },
);
test("copy keeps adjacent persisted assistant messages together but stops at a tool", async () => {
  using db = makeDb();
  db.createSession("group-selection", workspace);
  await db.syncHistory("group-selection", [
    new HumanMessage({ content: "问题", id: "user" }),
    new AIMessage({ content: "正文一", id: "first" }),
    new AIMessage({ content: "正文二", id: "second" }),
    new AIMessage({
      content: "",
      id: "invocation",
      tool_calls: [{ args: {}, id: "call", name: "inspect" }],
    }),
    new ToolMessage({ content: "结果", id: "result", tool_call_id: "call" }),
    new AIMessage({ content: "正文三", id: "third" }),
    new AIMessage({ content: "正文四", id: "fourth" }),
  ]);
  const snapshot = loadTranscript(db, "group-selection"),
    message = required(
      buildTimeline(snapshot.messages, [], []).find((item) => item.role === "assistant"),
    );
  expect(message.copyContent ?? message.content).toBe("正文三正文四");
  expect(message.parts.filter((part) => part.type === "content")).toHaveLength(4);
});
