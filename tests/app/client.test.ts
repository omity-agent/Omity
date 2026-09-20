import { afterEach, expect, test } from "bun:test";
import { readSessionDraft, writeSessionDraft } from "../../src/app/composerDraft";
import { setSessionControl, submitSessionMessage } from "../../src/client";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { createTestDirectory } from "../support/artifacts";
import { rmSync } from "node:fs";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { writeTestConfiguration } from "../support/configuration";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("client cancel during pause preserves pause state", () => {
  const { dbPath } = makeSession("123"),
    db = new AgentDatabase(dbPath);
  db.setControl("123", "pause");
  db.close();
  setSessionControl("123", "cancel");
  const reopened = new AgentDatabase(dbPath);
  expect(reopened.control("123")).toBe("pause_cancel");
  reopened.close();
});
test("single step is accepted only after a queue has reached pause", () => {
  const { dbPath } = makeSession("step");
  expect(() => setSessionControl("step", "step")).toThrow(
    expect.objectContaining({ code: "CONTROL_NOT_READY" }),
  );
  const db = new AgentDatabase(dbPath);
  db.appendUser("step", "run");
  const item = db.nextQueue("step");
  if (!item) {
    throw new Error("测试队列不存在");
  }
  db.startQueue("step", item);
  db.setQueueStatus(item.id, "paused");
  db.close();
  expect(setSessionControl("step", "step")).toEqual({ control: "step" });
  const reopened = new AgentDatabase(dbPath);
  expect(reopened.control("step")).toBe("step");
  reopened.close();
});
test("message enqueue and submitted draft clear commit together", () => {
  const { dbPath } = makeSession("submit");
  writeSessionDraft("submit", "消息", 1);
  const result = submitSessionMessage("submit", "消息", 1, "abc12345"),
    reopened = new AgentDatabase(dbPath);
  expect(result.queueId).toBePositive();
  expect(reopened.nextQueue("submit")).toMatchObject({
    content: "消息",
    id: result.queueId,
    status: "pending",
  });
  expect(readSessionDraft("submit")).toEqual({ content: "", revision: 1 });
  reopened.close();
});
function makeSession(sessionId: string) {
  const root = createTestDirectory("client");
  dirs.push(root);
  writeTestConfiguration(root);
  const paths = sessionPaths(sessionId);
  dirs.push(paths.dir);
  const db = new AgentDatabase(paths.dbPath);
  db.createSession(sessionId, root);
  db.close();
  return { dbPath: paths.dbPath };
}
