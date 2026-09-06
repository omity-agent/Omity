import { makeDb, workspace } from "../../support/database";
import { BunSqliteSaver } from "../../../src/checkpointer";
import { HookRuntime } from "../../../src/hooks/runtime";
import type { HostContext } from "../../../src/runtime/context";
import { Logger } from "../../../src/infrastructure/logging/logger";
import { MockLanguageModelV4 } from "ai/test";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ToolExecutions } from "../../../src/agent/toolExecutions";
import { createAgentGraph } from "../../../src/agent";
import { simulateReadableStream } from "ai";
import { testSettings } from "../../support/settings";

export function agentFixture({
  db = makeDb(),
  model = new MockLanguageModelV4({ doStream: textResponse() }),
  sessionId = "target",
  tools = [],
}: {
  db?: ReturnType<typeof makeDb>;
  model?: MockLanguageModelV4;
  sessionId?: string;
  tools?: StructuredToolInterface[];
} = {}) {
  const settings = testSettings(),
    logger = new Logger("error", true),
    checkpointer = new BunSqliteSaver(db.db),
    executions = new ToolExecutions({
      cancellationRequested: (callId) => db.toolCancellation(sessionId, callId),
    }),
    hooks = new HookRuntime([], tools, db.db, logger, sessionId, workspace),
    graph = createAgentGraph({
      checkpointer,
      hooks,
      model,
      settings,
      toolExecutions: executions,
      tools,
    }),
    context: HostContext = {
      checkpointer,
      controller: new AbortController(),
      db,
      graph,
      logger,
      sessionId,
      settings,
      toolExecutions: executions,
    };
  return { context, db, executions, model };
}
const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};
function textResponse() {
  return {
    stream: simulateReadableStream({
      chunks: [
        { id: "answer", type: "text-start" as const },
        { delta: "continued", id: "answer", type: "text-delta" as const },
        { id: "answer", type: "text-end" as const },
        {
          finishReason: { raw: undefined, unified: "stop" as const },
          type: "finish" as const,
          usage,
        },
      ],
    }),
  };
}
export function toolResponse() {
  return {
    stream: simulateReadableStream({
      chunks: [
        { id: "echo-call", toolName: "echo", type: "tool-input-start" as const },
        { delta: "{}", id: "echo-call", type: "tool-input-delta" as const },
        { id: "echo-call", type: "tool-input-end" as const },
        { input: "{}", toolCallId: "echo-call", toolName: "echo", type: "tool-call" as const },
        {
          finishReason: { raw: undefined, unified: "tool-calls" as const },
          type: "finish" as const,
          usage,
        },
      ],
    }),
  };
}
