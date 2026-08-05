import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import { recordAiStreamPart, recordToolStarted } from "../../src/runtime/aiStream";
import { streamTimelineMessages, toolCallLifecycle } from "../../src/app/timeline/streamEvents";
import { AIMessage } from "@langchain/core/messages";
import { Logger } from "../../src/infrastructure/logging/logger";
import type { StreamEvent } from "../../src/infrastructure/database/records/streamEvents";
import { createStreamLogState } from "../../src/runtime/stream";
import { testSettings } from "../support/settings";

afterEach(cleanupDatabaseDirs);
test("AI SDK stream groups response parts and exposes tool metadata before execution", () => {
  const db = makeDb();
  db.resetSession("session", workspace);
  const queueId = db.appendUser("session", "run");
  const events: StreamEvent[] = [];
  db.onChange((event) => events.push(event));
  const context = {
    db,
    logger: new Logger("error", true),
    sessionId: "session",
    settings: testSettings(workspace),
  };
  const state = createStreamLogState();
  recordAiStreamPart(
    context,
    queueId,
    { part: { id: "reasoning-1", text: "first", type: "reasoning-delta" } },
    state,
  );
  recordAiStreamPart(
    context,
    queueId,
    { part: { id: "reasoning-2", text: "second", type: "reasoning-delta" } },
    state,
  );
  recordAiStreamPart(
    context,
    queueId,
    {
      freeform: true,
      part: { id: "call-1", toolName: "shell", type: "tool-input-start" },
    },
    state,
  );
  recordAiStreamPart(
    context,
    queueId,
    { part: { delta: "dir", id: "call-1", type: "tool-input-delta" } },
    state,
  );
  const [streaming] = timeline(events);
  expect(streaming?.parts).toHaveLength(2);
  expect(streaming?.parts[0]).toEqual({ content: "firstsecond", type: "reasoning" });
  expect(streaming?.parts[1]).toMatchObject({
    call: { name: "shell", rawInput: "dir" },
    type: "tool",
  });
  recordToolStarted(
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
    started: true,
    type: "tool",
  });
  db.close();
});
function timeline(events: StreamEvent[]) {
  const outputs = new Map();
  const { finished, started } = toolCallLifecycle(events, outputs);
  return streamTimelineMessages(events, outputs, started, finished);
}
