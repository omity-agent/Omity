import { expect, test } from "bun:test";
import type { SessionInfo } from "../../../src/app/sessionState";
import { readSessionEvent } from "../../../src/app/frontend/services/events/data";
import { upsertSessionList } from "../../../src/app/frontend/services/queries";

test.each(["waiting", "streaming"] as const)("session upserts are idempotent for %s", (status) => {
  const idle = session("idle", 1),
    running = session(status, 2),
    sessions = upsertSessionList(upsertSessionList([idle], running), running);
  expect(sessions).toEqual([running]);
});
test("title-only SSE updates replace the session without changing its identity", () => {
  const previous = session("idle", 1),
    renamed = { ...previous, title: "新的会话标题" },
    event = new MessageEvent("session", {
      data: JSON.stringify(renamed),
      lastEventId: "123e4567-e89b-42d3-a456-426614174000:1",
    });
  expect(upsertSessionList([previous], readSessionEvent(event))).toEqual([renamed]);
});
function session(status: SessionInfo["status"], updatedAt: number): SessionInfo {
  return {
    createdAt: 1,
    error: null,
    id: "session",
    status,
    title: "session",
    updatedAt,
    workspace: "F:/workspace",
  };
}
