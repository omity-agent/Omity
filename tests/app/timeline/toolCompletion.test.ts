import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../../support/database";
import type { StreamEvent } from "../../../src/infrastructure/database/records/streamEvents";
import { buildTimeline } from "../../../src/app/timeline";
import { loadTranscript } from "../../../src/app/transcript";

afterEach(cleanupDatabaseDirs);
test("syncing tool output emits a versioned completion event", async () => {
  const db = makeDb();
  const sessionId = "tool-finished-session";
  db.resetSession(sessionId, workspace);
  const queueId = db.appendUser(sessionId, "run command");
  db.startQueue(sessionId, required(db.nextQueue(sessionId)));
  void db.appendStream(sessionId, {
    kind: "tool_call_delta",
    messageId: "assistant-1",
    partId: "tool-0",
    queueId,
    value: {
      idDelta: "call-1",
      index: 0,
      nameDelta: "shell",
    },
  });
  void db.appendStream(sessionId, {
    kind: "tool_started",
    messageId: "assistant-1",
    partId: "tool-0",
    queueId,
    value: "call-1",
  });
  const emitted: StreamEvent[] = [];
  db.onChange((event) => emitted.push(event));
  await db.syncHistory(sessionId, [
    new HumanMessage({ content: "run command", id: `queue:${sessionId}:${queueId.toString()}` }),
    new AIMessage({
      content: "",
      id: "assistant-1",
      tool_calls: [{ args: {}, id: "call-1", name: "shell" }],
    }),
    new ToolMessage({ content: "done", id: "tool-1", tool_call_id: "call-1" }),
  ]);
  const transcript = loadTranscript(db, sessionId);
  expect(emitted).toHaveLength(1);
  expect(emitted[0]).toMatchObject({
    kind: "tool_finished",
    value: {
      callId: "call-1",
      output: { content: "done" },
    },
  });
  expect(transcript.eventCursor).toBe(required(emitted[0]).id);
  expect(transcript.events.map(({ kind }) => kind)).toEqual([
    "user_appended",
    "tool_call_delta",
    "tool_started",
    "tool_finished",
  ]);
  const tool = buildTimeline(transcript.messages, transcript.queue, transcript.events)
    .flatMap((message) => message.parts)
    .find((part) => part.type === "tool");
  expect(tool?.type === "tool" ? tool.output?.content : undefined).toBe("done");
  expect(tool?.type === "tool" ? tool.phase : undefined).toBe("completed");
  const appendedQueueId = db.appendUser(sessionId, "next");
  const appended = required(db.pendingAppends(sessionId).find(({ id }) => id === appendedQueueId));
  db.startQueue(sessionId, appended);
  const withAppend = loadTranscript(db, sessionId);
  const timeline = buildTimeline(withAppend.messages, withAppend.queue, withAppend.events);
  expect(timeline.map(({ role }) => role)).toEqual(["user", "assistant", "user"]);
  expect(
    timeline.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "tool" ? [part.call.id] : [])),
    ),
  ).toEqual(["call-1"]);
  db.close();
});
test("syncing one tool does not drop the remaining parallel tool calls", async () => {
  const db = makeDb();
  const sessionId = "partial-tool-finished-session";
  db.resetSession(sessionId, workspace);
  const queueId = db.appendUser(sessionId, "run commands");
  db.startQueue(sessionId, required(db.nextQueue(sessionId)));
  try {
    await db.syncHistory(sessionId, [
      new HumanMessage({ content: "run commands", id: `queue:${sessionId}:${queueId.toString()}` }),
      new AIMessage({
        content: "",
        id: "assistant-1",
        tool_calls: [
          { args: {}, id: "call-1", name: "tool-1" },
          { args: {}, id: "call-2", name: "tool-2" },
          { args: {}, id: "call-3", name: "tool-3" },
        ],
      }),
    ]);
    void db.appendStream(sessionId, {
      kind: "tool_call_delta",
      messageId: "assistant-1",
      partId: "tool-0",
      queueId,
      value: { idDelta: "call-1", index: 0, nameDelta: "tool-1" },
    });
    void db.appendStream(sessionId, {
      kind: "tool_call_delta",
      messageId: "assistant-1",
      partId: "tool-1",
      queueId,
      value: { idDelta: "call-2", index: 1, nameDelta: "tool-2" },
    });
    void db.appendStream(sessionId, {
      kind: "tool_call_delta",
      messageId: "assistant-1",
      partId: "tool-2",
      queueId,
      value: { idDelta: "call-3", index: 2, nameDelta: "tool-3" },
    });
    void db.appendStream(sessionId, {
      kind: "tool_started",
      messageId: "assistant-1",
      partId: "tool-0",
      queueId,
      value: "call-1",
    });
    await db.syncHistory(sessionId, [
      new HumanMessage({ content: "run commands", id: `queue:${sessionId}:${queueId.toString()}` }),
      new AIMessage({
        content: "",
        id: "assistant-1",
        tool_calls: [{ args: {}, id: "call-1", name: "tool-1" }],
      }),
      new ToolMessage({ content: "done", id: "tool-1", tool_call_id: "call-1" }),
    ]);
    const transcript = loadTranscript(db, sessionId);
    const callIds = buildTimeline(transcript.messages, transcript.queue, transcript.events).flatMap(
      (message) => message.parts.flatMap((part) => (part.type === "tool" ? [part.call.id] : [])),
    );
    expect(transcript.events.map(({ kind }) => kind)).toEqual([
      "user_appended",
      "tool_call_delta",
      "tool_call_delta",
      "tool_call_delta",
      "tool_started",
      "tool_finished",
    ]);
    expect(callIds).toEqual(["call-1", "call-2", "call-3"]);
    await db.syncHistory(sessionId, db.history(sessionId));
    expect(
      loadTranscript(db, sessionId).events.filter(({ kind }) => kind === "tool_finished"),
    ).toHaveLength(1);
  } finally {
    db.close();
  }
});
