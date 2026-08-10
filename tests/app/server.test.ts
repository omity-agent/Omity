import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolveSessionState, resolveSessionStatus } from "../../src/app/sessionState";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { AppController } from "../../src/app/controller";
import { AppInstanceLock } from "../../src/app/runtime/instanceLock";
import { AppRegistry } from "../../src/app/registry";
import { appendAssistantMessage } from "../../src/infrastructure/database/records/messages/history";
import { captureError } from "../../src/failures/details";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { required } from "../support/database";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { userDataDirectory } from "../../src/infrastructure/configuration/settings/files";
import { writeTestConfiguration } from "../support/configuration";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
  rmSync(join(userDataDirectory(), "sessions"), { force: true, recursive: true });
});
test("app session summaries expose paused queue errors", async () => {
  const root = makeRoot(),
    workspace = join(root, "workspace");
  mkdirSync(workspace);
  const paths = sessionPaths("failed-session"),
    db = new AgentDatabase(paths.dbPath);
  db.createSession("failed-session", workspace);
  const queueId = db.appendUser("failed-session", "test");
  db.setQueueStatus(queueId, "paused", captureError(new Error("model request failed")));
  db.close();
  const controller = new AppController(root);
  expect(controller.bootstrap().sessions[0]).toMatchObject({
    error: { message: "model request failed", name: "Error" },
    id: "failed-session",
    status: "error",
  });
  await controller.close();
});
test("pending appends do not turn a paused run into a pausing session", async () => {
  const root = makeRoot(),
    workspace = join(root, "workspace");
  mkdirSync(workspace);
  const paths = sessionPaths("paused-session"),
    db = new AgentDatabase(paths.dbPath);
  db.createSession("paused-session", workspace);
  const queueId = db.appendUser("paused-session", "first");
  db.setQueueStatus(queueId, "paused");
  db.setControl("paused-session", "pause");
  db.appendUser("paused-session", "appended");
  db.close();
  const controller = new AppController(root);
  expect(controller.bootstrap().sessions[0]).toMatchObject({
    id: "paused-session",
    status: "paused",
  });
  await controller.close();
});
test("app registry serves a memory projection refreshed one session at a time", () => {
  const root = makeRoot(),
    workspace = join(root, "workspace");
  mkdirSync(workspace);
  const paths = sessionPaths("cli-session"),
    db = new AgentDatabase(paths.dbPath);
  db.createSession("cli-session", workspace);
  db.close();
  const registry = new AppRegistry(),
    sessions = registry.list();
  expect(sessions).toHaveLength(1);
  const session = required(sessions[0]);
  expect(session.id).toBe("cli-session");
  expect(session.workspace).toBe(workspace);
  expect(typeof session.createdAt).toBe("number");
  expect(typeof session.updatedAt).toBe("number");
  const secondPaths = sessionPaths("second-session"),
    second = new AgentDatabase(secondPaths.dbPath);
  second.createSession("second-session", workspace);
  second.close();
  expect(registry.list()).toHaveLength(1);
  expect(registry.refresh("second-session").control).toBe("running");
  const changed = new AgentDatabase(secondPaths.dbPath);
  changed.setControl("second-session", "pause");
  changed.close();
  expect(registry.require("second-session").control).toBe("running");
  expect(registry.refresh("second-session").control).toBe("pause");
  rmSync(secondPaths.dir, { force: true, recursive: true });
  registry.remove("second-session");
  expect(() => registry.require("second-session")).toThrow("会话不存在");
  expect(existsSync(join(userDataDirectory(), "app.sqlite"))).toBe(false);
});
test("app registry includes the latest persisted message in the session activity time", () => {
  const root = makeRoot(),
    workspace = join(root, "workspace");
  mkdirSync(workspace);
  const paths = sessionPaths("conversation"),
    db = new AgentDatabase(paths.dbPath);
  db.createSession("conversation", workspace);
  appendAssistantMessage(db.db, "conversation", "已完成");
  db.db.run("UPDATE sessions SET updated_at = 1");
  db.db.run("UPDATE messages SET created_at = 50");
  db.close();
  const session = required(new AppRegistry().list()[0]);
  expect(session.updatedAt).toBe(50);
});
test("app instance lock rejects a second server for the same data directory", () => {
  const directory = userDataDirectory(),
    lock = AppInstanceLock.acquire(directory);
  expect(() => AppInstanceLock.acquire(directory)).toThrow("数据目录已有 App 在运行");
  lock.release();
  expect(existsSync(join(directory, "app.lock"))).toBe(false);
});
test("session status prioritizes errors and pauses over host activity", () => {
  const running = {
      control: "running" as const,
      error: null,
      paused: false,
      queueRunning: true,
    },
    failure = captureError(new Error("Run failed"));
  expect(resolveSessionStatus(running, "model", null)).toBe("model");
  expect(resolveSessionStatus(running, "tool", failure)).toBe("error");
  expect(resolveSessionStatus({ ...running, paused: true }, "tool", null)).toBe("tool");
  expect(resolveSessionStatus({ ...running, error: failure }, "model", null)).toBe("error");
  expect(resolveSessionStatus({ ...running, control: "pause" }, "model", null)).toBe("pausing");
  expect(
    resolveSessionStatus({ ...running, control: "pause", queueRunning: false }, "idle", null),
  ).toBe("paused");
  expect(
    resolveSessionStatus({ ...running, paused: true, queueRunning: false }, "idle", null),
  ).toBe("paused");
  expect(resolveSessionStatus({ ...running, paused: true }, "tool", null)).toBe("tool");
});
test("session state exposes host errors before queue errors", () => {
  const runError = captureError(new Error("Run failed")),
    hostError = captureError(new Error("Host failed")),
    session = {
      control: "running" as const,
      error: runError,
      paused: true,
      queueRunning: false,
    };
  expect(resolveSessionState(session, "model", hostError)).toEqual({
    error: hostError,
    status: "error",
  });
  expect(resolveSessionState(session, "model", null)).toEqual({
    error: runError,
    status: "error",
  });
});
function makeRoot() {
  const root = createTestDirectory("app-registry");
  dirs.push(root);
  writeTestConfiguration(root);
  return root;
}
