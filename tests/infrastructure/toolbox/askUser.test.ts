import { expect, test } from "bun:test";
import { AskUserRuntime } from "../../../src/infrastructure/toolbox/runtime";
import { ToolMessage } from "@langchain/core/messages";
import { createAskUserTools } from "../../../src/infrastructure/toolbox/askUser";

test("ask_user tools keep their schemas and pass the tool call context", async () => {
  const requests: unknown[] = [];
  const tools = createAskUserTools(async (request, config) => {
    requests.push({ request, sessionId: config.configurable?.["sessionId"] });
    return { accepted: true };
  });
  const choice = tools.find((tool) => tool.name === "ask_user__choice");
  const openEnded = tools.find((tool) => tool.name === "ask_user__open_ended");
  if (!choice || !openEnded) {
    throw new Error("ask_user 工具集缺少内置工具");
  }
  const choiceOutput = await choice.invoke(
    { multiple: true, options: ["A", "B"], question: "选择" },
    {
      configurable: { sessionId: "session" },
      toolCall: {
        args: {},
        id: "choice-call",
        name: "ask_user__choice",
        type: "tool_call",
      },
    },
  );
  if (!ToolMessage.isInstance(choiceOutput) || typeof choiceOutput.content !== "string") {
    throw new Error("choice 工具输出不是文本 ToolMessage");
  }
  expect(JSON.parse(choiceOutput.content)).toEqual({ accepted: true });
  expect(requests[0]).toEqual({
    request: {
      callId: "choice-call",
      kind: "choice",
      multiple: true,
      options: ["A", "B"],
      question: "选择",
    },
    sessionId: "session",
  });
  expect(
    openEnded.invoke(
      { question: "请说明" },
      {
        configurable: { sessionId: "session" },
        toolCall: {
          args: {},
          id: "open-call",
          name: "ask_user__open_ended",
          type: "tool_call",
        },
      },
    ),
  ).resolves.toBeDefined();
});
test("ask_user runtime validates choice answers and exposes the pending question", async () => {
  const runtime = new AskUserRuntime();
  const question = {
    callId: "call",
    kind: "choice" as const,
    multiple: false,
    options: ["A", "B"],
    question: "选择",
  };
  const waiting = runtime.ask(question, "session");
  expect(runtime.question("session")).toEqual(question);
  expect(() => runtime.answer("session", "call", { note: "", options: [] })).toThrow(
    "没有备注时至少选择一个选项",
  );
  runtime.answer("session", "call", { note: "", options: ["A"] });
  expect(waiting).resolves.toEqual({ kind: "choice", note: "", options: ["A"] });
  expect(runtime.question("session")).toBeNull();
});
test("choice answers can omit options when a note is present", async () => {
  const runtime = new AskUserRuntime();
  const waiting = runtime.ask(
    {
      callId: "call",
      kind: "choice",
      multiple: true,
      options: ["A", "B"],
      question: "选择",
    },
    "session",
  );
  runtime.answer("session", "call", { note: "原因", options: [] });
  expect(waiting).resolves.toEqual({ kind: "choice", note: "原因", options: [] });
});
