import { AIMessage, AIMessageChunk, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import {
  createStreamLogState,
  discardActiveStream,
  handleStreamEvent,
  recordToolExecutionStarted,
} from "../../src/runtime/stream";
import type { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { ToolExecutions } from "../../src/agent/toolExecutions";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { testSettings } from "../support/settings";

afterEach(cleanupDatabaseDirs);
test("only the next pending tool call is marked as started", () => {
  const db = makeDb();
  const started: string[] = [];
  let startedPartId: string | undefined;
  let startedMessageId: string | undefined;
  const executions = new ToolExecutions();
  spyOn(db, "appendStream").mockImplementation((_sessionId, event) => {
    if (event.kind === "tool_started") {
      started.push(event.value);
      startedPartId = event.partId;
      startedMessageId = event.messageId;
    }
    return { ...event, id: started.length };
  });
  try {
    const ctx = context(db, executions);
    const state = createStreamLogState();
    handleStreamEvent(
      ctx,
      [
        "messages",
        [
          new AIMessageChunk({
            content: "",
            id: "message-1",
            tool_call_chunks: [
              { args: "", id: "call-1", index: 4, name: "first" },
              { args: "", id: "call-", index: 9, name: "second" },
            ],
          }),
          {},
        ],
      ],
      state,
      1,
    );
    recordToolExecutionStarted(
      ctx,
      [
        new AIMessage({
          content: "",
          id: "split-message-2",
          tool_calls: [
            { args: {}, id: "call-1", name: "first" },
            { args: {}, id: "call-2", name: "second" },
          ],
        }),
        new ToolMessage({ content: "done", tool_call_id: "call-1" }),
      ],
      1,
      state,
    );
    expect(started).toEqual(["call-2"]);
    expect(executions.cancel("call-1")).toBe(false);
    expect(executions.cancel("call-2")).toBe(true);
    expect(startedPartId).toBe("part-1");
    expect(startedMessageId).toBe("message-1");
  } finally {
    db.close();
  }
});
test("discarding a stream clears tool identity candidates", () => {
  const db = makeDb();
  spyOn(db, "appendStream").mockImplementation((_sessionId, event) => ({ ...event, id: 1 }));
  spyOn(db, "discardQueueStream").mockReturnValue(undefined);
  try {
    const state = createStreamLogState();
    handleStreamEvent(
      context(db, new ToolExecutions()),
      [
        "messages",
        [
          new AIMessageChunk({
            content: "",
            id: "attempt-1",
            tool_call_chunks: [{ args: "", id: "stale", index: 0, name: "run" }],
          }),
          {},
        ],
      ],
      state,
      1,
    );
    discardActiveStream(context(db, new ToolExecutions()), state, 1);
    expect(state.toolIdentity).toEqual({ calls: new Map() });
  } finally {
    db.close();
  }
});
test("checkpoint recovery starts a tool without a live stream identity", () => {
  const db = makeDb();
  let partId: string | undefined;
  spyOn(db, "appendStream").mockImplementation((_sessionId, event) => {
    ({ partId } = event);
    return { ...event, id: 1 };
  });
  try {
    recordToolExecutionStarted(
      context(db, new ToolExecutions()),
      [
        new AIMessage({
          content: "",
          id: "message-1",
          tool_calls: [{ args: {}, id: "call-1", name: "run" }],
        }),
      ],
      1,
      createStreamLogState(),
    );
    expect(partId).toBe("tool-0");
  } finally {
    db.close();
  }
});
function context(db: AgentDatabase, toolExecutions: ToolExecutions): HostContext {
  const settings = testSettings(workspace);
  const logger = new Logger("error", true);
  const checkpointer = new BunSqliteSaver(db.db, "session");
  const hooks = new HookRuntime([], [], db.db, logger, "session", workspace);
  const graph = createAgentGraph({ checkpointer, hooks, model: fakeModel(), settings, tools: [] });
  return {
    checkpointer,
    controller: new AbortController(),
    db,
    graph,
    logger,
    sessionId: "session",
    settings,
    toolExecutions,
  };
}
