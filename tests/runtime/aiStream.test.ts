import { afterEach, expect, mock, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import {
  completeActiveStream,
  createStreamLogState,
  discardActiveStream,
} from "../../src/runtime/stream";
import { recordAiStreamPart, recordToolStarted } from "../../src/runtime/aiStream";
import { streamTimelineMessages, toolCallLifecycle } from "../../src/app/timeline/streamEvents";
import { AIMessage } from "@langchain/core/messages";
import type { AiStreamEvent } from "../../src/agent/model/request";
import { Logger } from "../../src/infrastructure/logging/logger";
import type { StreamEvent } from "../../src/types";
import { agentFixture } from "./support/agentFixture";
import { processQueue } from "../../src/runtime/queue";
import { testSettings } from "../support/settings";

afterEach(cleanupDatabaseDirs);
test("AI SDK stream groups response parts and exposes tool metadata before execution", async () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  const queueId = db.appendUser("session", "run"),
    events: StreamEvent[] = [];
  db.onChange((event) => events.push(event));
  const context = {
      db,
      logger: new Logger("error", true),
      sessionId: "session",
      settings: testSettings(),
    },
    state = createStreamLogState();
  await recordAiStreamPart(
    context,
    queueId,
    { part: { id: "reasoning-1", text: "first", type: "reasoning-delta" } },
    state,
  );
  await recordAiStreamPart(
    context,
    queueId,
    { part: { id: "reasoning-2", text: "second", type: "reasoning-delta" } },
    state,
  );
  await recordAiStreamPart(
    context,
    queueId,
    {
      freeform: true,
      part: { id: "call-1", toolName: "shell", type: "tool-input-start" },
    },
    state,
  );
  await recordAiStreamPart(
    context,
    queueId,
    { part: { delta: "dir", id: "call-1", type: "tool-input-delta" } },
    state,
  );
  const [streaming] = timeline(events);
  expect(streaming?.parts).toHaveLength(2);
  expect(streaming?.parts[0]).toEqual({
    content: "first\nsecond",
    messageId: "reasoning-1",
    streaming: true,
    translations: [],
    type: "reasoning",
  });
  expect(streaming?.parts[1]).toMatchObject({
    call: { name: "shell", rawInput: "dir" },
    phase: "streaming",
    type: "tool",
  });
  await recordToolStarted(
    context,
    [
      new AIMessage({
        id: "response-1",
        tool_calls: [{ args: { input: "dir" }, id: "call-1", name: "shell" }],
      }),
    ],
    queueId,
  );
  const [, started] = timeline(events)[0]?.parts ?? [];
  expect(started).toMatchObject({
    call: { id: "call-1", name: "shell" },
    phase: "running",
    type: "tool",
  });
  db.close();
});
const contentParts: AiStreamEvent["part"][] = [
  { id: "part", text: "answer", type: "text-delta" },
  { id: "part", text: "thinking", type: "reasoning-delta" },
  { delta: "{}", id: "part", type: "tool-input-delta" },
  { input: {}, toolCallId: "part", toolName: "echo", type: "tool-call" },
];
test("hosted search stream never announces a pending local execution", async () => {
  const { context, db } = agentFixture(),
    state = createStreamLogState(),
    events: StreamEvent[] = [];
  db.resetSession("target", workspace);
  const queueId = db.appendUser("target", "search");
  db.onChange((event) => events.push(event));
  await recordAiStreamPart(
    context,
    queueId,
    {
      part: {
        id: "hosted",
        providerExecuted: true,
        toolName: "tool_search",
        type: "tool-input-start",
      },
    },
    state,
  );
  await recordAiStreamPart(
    context,
    queueId,
    {
      part: { delta: '{"paths":["find_file"]}', id: "hosted", type: "tool-input-delta" },
    },
    state,
  );
  expect(events).toEqual([]);
  expect(state.aiToolIndexes.size).toBe(0);
  expect(state.serverToolIds.has("hosted")).toBe(true);
  completeActiveStream(state);
  expect(state.serverToolIds.size).toBe(0);
  db.close();
});
test.each(contentParts)("only meaningful model content starts receiving: $type", async (part) => {
  const { context, db } = agentFixture(),
    activity = mock(),
    state = createStreamLogState();
  db.resetSession("target", workspace);
  const queueId = db.appendUser("target", "run"),
    emptyParts: AiStreamEvent["part"][] = [
      { type: "start" },
      { id: "part", type: "text-start" },
      { id: "part", text: "", type: "text-delta" },
      { id: "part", type: "reasoning-start" },
      { id: "part", text: "", type: "reasoning-delta" },
      { id: "part", toolName: "echo", type: "tool-input-start" },
      { delta: "", id: "part", type: "tool-input-delta" },
    ];
  context.observer = { activity, token: () => undefined };
  for (const empty of emptyParts) {
    await recordAiStreamPart(context, queueId, { part: empty }, state);
    expect(activity).not.toHaveBeenCalled();
  }
  await recordAiStreamPart(context, queueId, { part }, state);
  await recordAiStreamPart(context, queueId, { part }, state);
  expect(activity.mock.calls).toEqual([["target", "streaming"]]);
  completeActiveStream(state);
  expect(state.modelResponding).toBe(false);
  await recordAiStreamPart(context, queueId, { part }, state);
  expect(activity).toHaveBeenCalledTimes(2);
  discardActiveStream(context, state, queueId);
  expect(state.modelResponding).toBe(false);
  await recordAiStreamPart(context, queueId, { part }, state);
  expect(activity).toHaveBeenCalledTimes(3);
  db.close();
});
test("a graph run reports waiting, receiving and completion in order", async () => {
  const { context, db } = agentFixture(),
    activity = mock();
  db.resetSession("target", workspace);
  db.appendUser("target", "run");
  context.observer = { activity, token: () => undefined };
  await processQueue(context, required(db.nextQueue("target")));
  expect(db.nextQueue("target")).toBeNull();
  expect(activity.mock.calls).toEqual([
    ["target", "waiting"],
    ["target", "streaming"],
    ["target", "idle"],
  ]);
  db.close();
});
function timeline(events: StreamEvent[]) {
  const outputs = new Map(),
    lifecycle = toolCallLifecycle(events, outputs);
  return streamTimelineMessages(events, outputs, lifecycle);
}
