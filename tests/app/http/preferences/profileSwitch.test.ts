import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { submissionForm } from "../../../../src/app/attachments/submission";
import type { AppController } from "../../../../src/app/controller";
import { sessionPaths } from "../../../../src/infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../../../../src/infrastructure/database/agentDatabase";
import { readDefinitionRecord } from "../../../../src/infrastructure/database/records/session/metadata";
import { liveApplication } from "../liveApplication";

test("idle sessions can move a profile to the top without changing frozen tool schemas", async () => {
  await using app = await liveApplication();
  const profileDirectory = join(app.root, "home", "settings", "profiles", "alternate");
  mkdirSync(profileDirectory, { recursive: true });
  writeFileSync(join(profileDirectory, "model.yaml"), "model: alternate-model\n");
  const created = await fetch(`${app.url}/api/sessions`, {
      body: submissionForm({ history: [], message: "first question", workspace: app.root }, []),
      method: "POST",
    }),
    sessionId = z.object({ session: z.object({ id: z.string() }) }).parse(await created.json())
      .session.id;
  await waitForCompletedRun(app.controller, sessionId);
  const database = new AgentDatabase(sessionPaths(sessionId).dbPath);
  try {
    const before = readDefinitionRecord(database.db, sessionId),
      switched = await fetch(`${app.url}/api/sessions/${sessionId}/profile`, {
        body: JSON.stringify({ profile: "alternate" }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
    expect(switched.status).toBe(200);
    expect(await switched.json()).toMatchObject({
      session: { id: sessionId, profile: "alternate" },
    });
    const after = readDefinitionRecord(database.db, sessionId);
    expect(database.profiles(sessionId)).toEqual(["alternate"]);
    expect(after.prefix.model).toMatchObject({ model: "alternate-model" });
    expect(after.prefix.tools).toEqual(before.prefix.tools);
    await fetch(`${app.url}/api/sessions/${sessionId}/messages`, {
      body: submissionForm(
        { content: "second question", draftRevision: 0, submissionId: "a1b2c3d4" },
        [],
      ),
      method: "POST",
    });
    await waitForCompletedRun(app.controller, sessionId);
    expect(
      z
        .array(z.object({ model: z.string() }))
        .parse(app.requests)
        .map(({ model }) => model),
    ).toEqual(["test", "alternate-model"]);
  } finally {
    database.close();
  }
}, 15_000);
async function waitForCompletedRun(controller: AppController, sessionId: string) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const { queue } = controller.transcript(sessionId);
    if (queue.length > 0 && queue.every(({ status }) => status === "done")) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error("Profile 切换集成测试中的会话未完成");
    }
    await controller.events.wait(sessionId, 25);
  }
}
