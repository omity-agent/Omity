import { expect, test } from "bun:test";
import { makeDb, required, workspace } from "../support/database";
import { buildTimeline } from "../../src/app/timeline";
import { insertStreamEvent } from "../../src/infrastructure/database/records/streamEvents";
import { loadTranscript } from "../../src/app/transcript";
import { toolNotRunning } from "../../src/errors";

test("tool cancellation requests retain their first timestamp across reads and retries", () => {
  const db = makeDb();
  try {
    db.resetSession("session", workspace);
    db.appendUser("session", "run tool");
    const item = required(db.nextQueue("session"));
    db.startQueue("session", item);
    insertStreamEvent(db.db, "session", {
      kind: "tool_started",
      messageId: "message-1",
      partId: "tool-0",
      queueId: item.id,
      value: "call-1",
    });
    db.requestToolCancellation("session", "call-1");
    const requestedAt = db.toolCancellation("session", "call-1");
    expect(requestedAt).toBeNumber();
    db.requestToolCancellation("session", "call-1");
    expect(db.toolCancellation("session", "call-1")).toBe(requestedAt);
  } finally {
    db.close();
  }
});
test("tool cancellation rejects calls that are not running", () => {
  const db = makeDb();
  try {
    db.resetSession("session", workspace);
    expect(() => {
      db.requestToolCancellation("session", "missing");
    }).toThrow(toolNotRunning("missing").message);
  } finally {
    db.close();
  }
});
test("paused pending tool calls can be cancelled before execution starts", () => {
  const db = makeDb();
  try {
    db.resetSession("session", workspace);
    db.appendUser("session", "run tool");
    const item = required(db.nextQueue("session"));
    db.startQueue("session", item);
    db.setQueueStatus(item.id, "paused");
    insertStreamEvent(db.db, "session", {
      kind: "tool_call_delta",
      messageId: "message-1",
      partId: "tool-0",
      queueId: item.id,
      value: { idDelta: "call-1", index: 0, nameDelta: "capture" },
    });
    db.requestToolCancellation("session", "call-1");
    expect(db.toolCancellation("session", "call-1")).toBeNumber();
    const transcript = loadTranscript(db, "session"),
      parts = buildTimeline(transcript.messages, transcript.queue, transcript.events).flatMap(
        (message) => message.parts,
      );
    expect(parts.find((part) => part.type === "tool")).toMatchObject({
      output: { content: "工具运行 0 毫秒 后被用户手动终止。" },
      phase: "completed",
    });
    expect(db.nextQueue("session")?.status).toBe("paused");
  } finally {
    db.close();
  }
});
test("tool cancellation rejects calls that already finished", () => {
  const db = makeDb();
  try {
    db.resetSession("session", workspace);
    db.appendUser("session", "run tool");
    const item = required(db.nextQueue("session"));
    db.startQueue("session", item);
    insertStreamEvent(db.db, "session", {
      kind: "tool_started",
      messageId: "message-1",
      partId: "tool-0",
      queueId: item.id,
      value: "call-1",
    });
    insertStreamEvent(db.db, "session", {
      kind: "tool_finished",
      messageId: "message-1",
      partId: "tool-0",
      queueId: item.id,
      value: {
        callId: "call-1",
        output: { content: "done", images: [], outputTokens: 1 },
      },
    });
    expect(() => db.requestToolCancellation("session", "call-1")).toThrow(
      toolNotRunning("call-1").message,
    );
  } finally {
    db.close();
  }
});
