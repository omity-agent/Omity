import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { AppController } from "../../src/app/controller";
import { createTestDirectory } from "../support/artifacts";
import { hostOwnerId } from "../../src/infrastructure/process/ownership";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { recoverHostSession } from "../../src/runtime/execution/recovery";
import { required } from "../support/database";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { userDataDirectory } from "../../src/infrastructure/configuration/settings/files";
import { writeTestConfiguration } from "../support/configuration";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
  rmSync(join(userDataDirectory(), "sessions"), { force: true, recursive: true });
});
test("app startup atomically pauses an orphaned run", async () => {
  const fixture = interruptedSession("orphan"),
    pending = fixture.db.appendUser("orphan", "尚未消费的追加输入");
  fixture.db.close();
  const controller = new AppController(fixture.root),
    transcript = controller.transcript("orphan");
  expect(controller.bootstrap().sessions[0]?.status).toBe("paused");
  expect(transcript.control).toBe("pause");
  expect(transcript.queue.map(({ id, status }) => ({ id, status }))).toEqual([
    { id: fixture.queueId, status: "paused" },
    { id: pending, status: "pending" },
  ]);
  await controller.close();
});
test("app startup preserves the activity time of an already paused session", async () => {
  const fixture = interruptedSession("already-paused");
  fixture.db.setQueueStatus(fixture.queueId, "paused");
  fixture.db.setControl("already-paused", "pause");
  fixture.db.db.run("UPDATE sessions SET updated_at = 1 WHERE id = 'already-paused'");
  fixture.db.db.run("UPDATE messages SET created_at = 1 WHERE session_id = 'already-paused'");
  fixture.db.close();

  const controller = new AppController(fixture.root);
  expect(controller.bootstrap().sessions[0]?.updatedAt).toBe(1);
  await controller.close();
});
test("app startup reclaims the lease of its terminated predecessor", async () => {
  const fixture = interruptedSession("abandoned"),
    abandonedOwner = { pid: process.pid, token: randomUUID() };
  fixture.db.acquireHostLease({
    now: Date.now(),
    ownerId: hostOwnerId({
      instanceId: abandonedOwner.token,
      kind: "app",
      pid: abandonedOwner.pid,
    }),
    sessionId: "abandoned",
    ttlMs: 30_000,
  });
  fixture.db.close();
  const controller = new AppController(fixture.root, { abandonedOwner }),
    reopened = openSession("abandoned");
  expect(reopened.control("abandoned")).toBe("pause");
  expect(reopened.queueStatus(fixture.queueId)).toBe("paused");
  expect(reopened.hostLease("abandoned")).toBeNull();
  reopened.close();
  await controller.close();
});
test("app startup never takes over a live standalone host", async () => {
  const fixture = interruptedSession("live");
  fixture.db.acquireHostLease({
    now: Date.now(),
    ownerId: hostOwnerId({
      instanceId: randomUUID(),
      kind: "standalone",
      pid: process.pid,
    }),
    sessionId: "live",
    ttlMs: 30_000,
  });
  fixture.db.close();
  const controller = new AppController(fixture.root),
    reopened = openSession("live");
  expect(reopened.control("live")).toBe("running");
  expect(reopened.queueStatus(fixture.queueId)).toBe("running");
  expect(reopened.hostLease("live")).not.toBeNull();
  reopened.close();
  await controller.close();
});
test("standalone Host uses the shared interrupted-session recovery", () => {
  const fixture = interruptedSession("standalone");
  fixture.db.acquireHostLease({
    now: Date.now() - 1000,
    ownerId: hostOwnerId({
      instanceId: randomUUID(),
      kind: "standalone",
      pid: process.pid,
    }),
    sessionId: "standalone",
    ttlMs: 1,
  });
  expect(recoverHostSession(fixture.db, "standalone").status).toBe("recovered");
  expect(fixture.db.control("standalone")).toBe("pause");
  expect(fixture.db.queueStatus(fixture.queueId)).toBe("paused");
  fixture.db.close();
});
test("resume keeps the session MCP definition after configuration changes", async () => {
  const fixture = interruptedSession("resume-failure");
  fixture.db.close();
  writeFileSync(join(fixture.root, "settings", "toolbox.yaml"), "[]\n");
  const controller = new AppController(fixture.root);
  await controller.control("resume-failure", "running");
  await controller.close();
});
function interruptedSession(sessionId: string) {
  const root = createTestDirectory("app-recovery");
  roots.push(root);
  writeTestConfiguration(root);
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  const db = openSession(sessionId);
  db.createSession(sessionId, workspace);
  const queueId = db.appendUser(sessionId, "运行中的输入");
  db.startQueue(sessionId, required(db.nextQueue(sessionId)));
  return { db, queueId, root };
}
function openSession(sessionId: string) {
  return new AgentDatabase(sessionPaths(sessionId).dbPath);
}
