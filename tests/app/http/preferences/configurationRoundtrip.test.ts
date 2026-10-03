import { type AppMcp, createAppMcp } from "../../../../src/app/runtime/resources/toolPool";
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { AgentDatabase } from "../../../../src/infrastructure/database/agentDatabase";
import { AskUserRuntime } from "../../../../src/infrastructure/toolbox/runtime";
import type { SessionSubmission } from "../../../../src/app/attachments/contract";
import { createSettingsContext } from "../../../../src/infrastructure/configuration/settings/context";
import { liveApplication } from "../liveApplication";
import { readDefinitionRecord } from "../../../../src/infrastructure/database/records/session/metadata";
import { sessionPaths } from "../../../../src/infrastructure/configuration/sessionPaths";
import { submissionForm } from "../../../../src/app/attachments/submission";
import { writeToolboxConfiguration } from "../../../support/builtins";
import { z } from "zod";

const sessionResponse = z.object({ session: z.object({ id: z.string() }) }),
  optionsResponse = z.object({
    hooks: z.array(z.object({ enable: z.boolean(), id: z.string() })),
    mcpServers: z.array(z.object({ enable: z.boolean(), id: z.string() })),
    model: z.string(),
  });
function createSubmission(
  root: string,
  overrides: Partial<Omit<SessionSubmission, "attachments">>,
) {
  return submissionForm({ history: [], message: "hello", workspace: root, ...overrides }, []);
}
test("HTTP session preferences list disabled servers without resolving secrets and preserve per-session selections", async () => {
  await using app = await liveApplication();
  const optionalServer = {
      args: [resolve(import.meta.dir, "identityServer.ts")],
      command: process.execPath,
      enabled: false,
    },
    unavailableServer = { command: `\${OMITY_UNCONFIGURED_COMMAND}`, enabled: true },
    profileDirectory = join(app.root, "home", "settings", "profiles", "alternate");
  writeToolboxConfiguration(app.root, {
    mcpServers: { optional: optionalServer, unavailable: unavailableServer },
    toolNameOverrides: { unavailable__identity: "unavailable_identity" },
  });
  mkdirSync(profileDirectory, { recursive: true });
  writeFileSync(join(profileDirectory, "model.yaml"), "model: alternate-model\n");
  writeFileSync(
    join(profileDirectory, "toolbox.yaml"),
    "mcpServers:\n  optional:\n    enabled: true\n  unavailable:\n    enabled: false\n",
  );
  const response = await fetch(`${app.url}/api/session-options`),
    responseText = await response.text();
  expect(response.status).toBe(200);
  expect(responseText).not.toContain("OMITY_UNCONFIGURED_COMMAND");
  expect(responseText).not.toContain(process.execPath);
  expect(optionsResponse.parse(JSON.parse(responseText))).toEqual({
    hooks: [],
    mcpServers: [
      { enable: false, id: "optional" },
      { enable: true, id: "unavailable" },
    ],
    model: "test",
  });
  const profileOptions = await fetch(`${app.url}/api/session-options?profile=alternate`);
  expect(optionsResponse.parse(await profileOptions.json())).toEqual({
    hooks: [],
    mcpServers: [
      { enable: true, id: "optional" },
      { enable: false, id: "unavailable" },
    ],
    model: "alternate-model",
  });
  const invalidModel = await fetch(`${app.url}/api/sessions`, {
      body: createSubmission(app.root, { model: "   " }),
      method: "POST",
    }),
    invalidServer = await fetch(`${app.url}/api/sessions`, {
      body: createSubmission(app.root, {
        mcpOverrides: { missing: true, unavailable: false },
      }),
      method: "POST",
    });
  expect(invalidModel.status).toBe(400);
  expect(invalidServer.status).toBe(400);
  expect(await invalidServer.json()).toMatchObject({
    error: { code: "MCP_SELECTION_INVALID" },
  });
  const overrides = { optional: true, unavailable: false },
    created = await fetch(`${app.url}/api/sessions`, {
      body: createSubmission(app.root, { mcpOverrides: overrides, model: " chosen-model " }),
      method: "POST",
    });
  expect(created.status).toBe(200);
  const { session } = sessionResponse.parse(await created.json()),
    database = new AgentDatabase(sessionPaths(session.id).dbPath);
  let restoredMcp: AppMcp | undefined;
  try {
    const deadline = Date.now() + 5000;
    while (!app.controller.transcript(session.id).queue.every(({ status }) => status === "done")) {
      if (Date.now() >= deadline) {
        throw new Error("模型没有完成会话配置集成测试");
      }
      await app.controller.events.wait(session.id, 25);
    }
    expect(app.requests).toHaveLength(1);
    expect(app.requests[0]).toMatchObject({ model: "chosen-model" });
    const definition = readDefinitionRecord(database.db, session.id);
    expect(definition.prefix.model).toMatchObject({
      adapter: "completions",
      model: "chosen-model",
    });
    expect(definition.prefix.tools.serverOverrides).toEqual(overrides);
    expect(definition.prefix.tools.tools.map(({ name }) => name)).toContain("optional__identity");
    expect(definition.prefix.tools.tools.map(({ name }) => name)).not.toContain(
      "unavailable_identity",
    );
    restoredMcp = createAppMcp(
      app.root,
      "error",
      createSettingsContext(app.root),
      new AskUserRuntime(() => undefined),
    );
    const restored = await restoredMcp.loadSession(
      session.id,
      database.profiles(session.id),
      definition.prefix.tools,
      app.root,
    );
    expect(Object.keys(restored.configuration.mcpServers)).toEqual(["optional"]);
    expect(restored.tools.map(({ name }) => name)).toContain("optional__identity");
    expect(restored.tools.map(({ name }) => name)).toContain("ask_user__open_ended");
  } finally {
    await restoredMcp?.close();
    database.close();
  }
  const withoutServers = await fetch(`${app.url}/api/sessions`, {
    body: createSubmission(app.root, {
      mcpOverrides: { optional: false, unavailable: false },
      model: "test",
    }),
    method: "POST",
  });
  expect(withoutServers.status).toBe(200);
  const disabledSession = sessionResponse.parse(await withoutServers.json()).session,
    disabledDatabase = new AgentDatabase(sessionPaths(disabledSession.id).dbPath);
  try {
    const { tools } = readDefinitionRecord(disabledDatabase.db, disabledSession.id).prefix.tools;
    expect(tools.map(({ name }) => name)).toContain("ask_user__open_ended");
    expect(tools.map(({ name }) => name)).not.toContain("optional__identity");
  } finally {
    disabledDatabase.close();
  }
}, 15_000);
