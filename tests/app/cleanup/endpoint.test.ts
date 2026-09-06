import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { AgentDatabase } from "../../../src/infrastructure/database/agentDatabase";
import { AppController } from "../../../src/app/controller";
import { createApi } from "../../../src/app/http/handler";
import { createApiController } from "../support/apiController";
import { createTestDirectory } from "../../support/artifacts";
import { hostOwnerId } from "../../../src/infrastructure/process/ownership";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { sessionPaths } from "../../../src/infrastructure/configuration/sessionPaths";
import { writeTestConfiguration } from "../../support/configuration";

const roots: string[] = [],
  originalHome = process.env["OMITY_HOME"];
afterEach(() => {
  process.env["OMITY_HOME"] = originalHome;
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});
test("cleanup API forwards the session ID and skipped entries", async () => {
  const calls: string[] = [],
    api = createApi(
      createApiController({
        clearTemporaryFiles: (id) => {
          calls.push(id);
          return Promise.resolve({ skipped: ["locked.txt"] });
        },
      }),
    ),
    response = await api.request("/api/sessions/cleanup-api/temporary-files", { method: "DELETE" });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ skipped: ["locked.txt"] });
  expect(calls).toEqual(["cleanup-api"]);
  const invalid = await api.request("/api/sessions/abc%2Fdef/temporary-files", {
    method: "DELETE",
  });
  expect(invalid.status).toBe(400);
  expect(calls).toEqual(["cleanup-api"]);
});
test("controller permits cleanup while running and rejects unknown sessions", async () => {
  const root = createTestDirectory("cleanup-controller");
  process.env["OMITY_HOME"] = join(root, "storage");
  const paths = sessionPaths("cleanup-running"),
    db = new AgentDatabase(paths.dbPath);
  roots.push(root, paths.dir);
  writeTestConfiguration(root);
  db.createSession("cleanup-running", root);
  const queueId = db.appendUser("cleanup-running", "running task");
  db.setQueueStatus(queueId, "running");
  db.acquireHostLease({
    now: Date.now(),
    ownerId: hostOwnerId({ instanceId: randomUUID(), kind: "standalone", pid: process.pid }),
    sessionId: "cleanup-running",
    ttlMs: 30_000,
  });
  db.close();
  mkdirSync(paths.tempDir);
  writeFileSync(join(paths.tempDir, "scratch.txt"), "temporary");
  const controller = new AppController(root);
  try {
    const api = createApi(controller),
      response = await api.request("/api/sessions/cleanup-running/temporary-files", {
        method: "DELETE",
      });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skipped: [] });
    expect(readdirSync(paths.tempDir)).toEqual([]);
    expect(controller.transcript("cleanup-running").control).toBe("running");
    expect(controller.transcript("cleanup-running").queue).toMatchObject([
      { id: queueId, status: "running" },
    ]);
    const unknown = await api.request("/api/sessions/cleanup-unknown/temporary-files", {
      method: "DELETE",
    });
    expect(unknown.status).toBe(404);
  } finally {
    await controller.close();
  }
});
