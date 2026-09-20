import { type AppMcp, createAppMcp } from "../../src/app/runtime/resources/toolPool";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import { defaultBuiltIns, writeToolboxConfiguration } from "../support/builtins";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { AskUserRuntime } from "../../src/infrastructure/toolbox/runtime";
import { HumanMessage } from "@langchain/core/messages";
import { buildTimeline } from "../../src/app/timeline";
import { createSettingsContext } from "../../src/infrastructure/configuration/settings/context";
import { createSnapshotSession } from "../../src/app/runtime/sessionSnapshot";
import { createTestDirectory } from "../support/artifacts";
import { emptySessionDefinition } from "../../src/infrastructure/database/sessionDefinition";
import { join } from "node:path";
import { loadTranscript } from "../../src/app/transcript";
import { prepareHostSession } from "../../src/runtime/execution/sessionPreparation";
import { readDefinitionRecord } from "../../src/infrastructure/database/records/sessions";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { writeTestConfiguration } from "../support/configuration";

const roots: string[] = [],
  databases: AgentDatabase[] = [],
  sessionDirectories: string[] = [],
  mcps: AppMcp[] = [];
afterEach(async () => {
  await Promise.all(mcps.splice(0).map((mcp) => mcp.close()));
  for (const database of databases.splice(0)) {
    database.close();
  }
  for (const directory of sessionDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
  await cleanupDatabaseDirs();
});
test("empty system instructions are omitted from the timeline", () => {
  const db = makeDb(),
    definition = emptySessionDefinition();
  definition.prefix.systemPrompt = " \n";
  db.resetSession("empty-instructions", workspace, [], definition);
  db.appendUser("empty-instructions", "message");
  const transcript = loadTranscript(db, "empty-instructions");
  expect(buildTimeline(transcript.messages, transcript.queue, []).map(({ role }) => role)).toEqual([
    "user",
  ]);
  db.close();
});
test("session prefix exposes instructions as a system message", async () => {
  const db = makeDb(),
    definition = emptySessionDefinition();
  definition.prefix.systemPrompt = "Follow the project instructions.";
  db.resetSession("system-session", workspace, [], definition);
  await db.syncHistory("system-session", [
    new HumanMessage({ content: "Implement the feature.", id: "user-1" }),
  ]);
  const transcript = loadTranscript(db, "system-session"),
    messages = buildTimeline(transcript.messages, transcript.queue, []);
  expect(messages.map(({ role }) => role)).toEqual(["system", "user"]);
  expect(messages[0]).toMatchObject({
    content: "Follow the project instructions.",
    parts: [{ content: "Follow the project instructions.", type: "content" }],
  });
  db.close();
});
test("session snapshots lock only the model prefix while runtime configuration changes", async () => {
  const root = createTestDirectory("session-snapshot"),
    builtIns = defaultBuiltIns(),
    toolboxes = {
      choice: { ...builtIns.choice!, enabled: true },
      open_ended: { ...builtIns.open_ended!, enabled: true },
    };
  roots.push(root);
  writeTestConfiguration(root, {
    hooksYaml: `hooks:
  - { id: notify, enable: true, target: agent, when: after, runLimit: -1, mode: silent, tool: ${JSON.stringify(toolboxes.open_ended.name)}, args: {} }
  - { id: review, enable: false, target: agent, when: before, runLimit: -1, mode: silent, tool: ${JSON.stringify(toolboxes.choice.name)}, args: {} }
`,
    modelYaml: `adapter: completions
model: locked-model
apiKeyEnv: INITIAL_KEY
baseURL: https://locked.example.test
temperature: 0
reasoning_effort: medium
retryDelayMs: 1000
timeoutMs: 1000
`,
    systemPrompt: "locked prompt",
  });
  writeToolboxConfiguration(root, { toolboxes });
  const workspacePath = join(root, "workspace");
  mkdirSync(workspacePath);
  const context = createSettingsContext(root, join(root, "user-settings")),
    mcp = createAppMcp(root, "debug", context, new AskUserRuntime(() => undefined)),
    created = await createSnapshotSession({
      baseContext: context,
      mcp,
      root,
      submission: {
        attachments: [],
        history: [],
        hookOverrides: { notify: false, review: true },
        message: "hello",
        workspace: workspacePath,
      },
    }),
    paths = sessionPaths(created.sessionId),
    db = new AgentDatabase(paths.dbPath),
    definition = readDefinitionRecord(db.db, created.sessionId);
  databases.push(db);
  mcps.push(mcp);
  sessionDirectories.push(paths.dir);
  writeFileSync(join(root, "settings", "prompts", "system.md"), "changed prompt");
  writeFileSync(
    join(root, "settings", "model.yaml"),
    `adapter: responses
model: changed-model
apiKeyEnv: CURRENT_KEY
baseURL: https://changed.example.test
temperature: 0.75
reasoning_effort: high
retryDelayMs: 2500
timeoutMs: 3500
`,
  );
  writeToolboxConfiguration(root, {
    stdio: { restart: { delayMs: 4321, maxAttempts: 7 } },
    toolboxes,
  });
  expect(definition.prefix.systemPrompt).toBe("locked prompt\n\nuse skills");
  expect(definition.hookOverrides).toEqual({ notify: false, review: true });
  expect(readFileSync(join(root, "settings", "hooks.yaml"), "utf8")).toContain(
    "id: notify, enable: true",
  );
  expect(definition.prefix.model).toEqual({
    adapter: "completions",
    baseURL: "https://locked.example.test",
    model: "locked-model",
    reasoning_effort: "medium",
  });
  expect(definition.prefix.tools).not.toHaveProperty("configuration");
  expect(definition.prefix.tools.tools.map(({ name }) => name)).toContain(
    toolboxes.open_ended.name,
  );
  const prepared = prepareHostSession({ kind: "load", sessionId: created.sessionId }, root, {
    cwd: workspacePath,
    settingsContext: context,
  });
  databases.push(prepared.db);
  expect(prepared.settings.agent.systemPrompt).toBe(definition.prefix.systemPrompt);
  expect(prepared.settings.hooks.map(({ id, enable }) => ({ enable, id }))).toEqual([
    { enable: false, id: "notify" },
    { enable: true, id: "review" },
  ]);
  expect(prepared.settings.model).toEqual({
    adapter: "completions",
    apiKeyEnv: "CURRENT_KEY",
    baseURL: "https://locked.example.test",
    model: "locked-model",
    reasoning_effort: "medium",
    retryDelayMs: 2500,
    temperature: 0.75,
    timeoutMs: 3500,
  });
  const restoredMcp = createAppMcp(root, "debug", context, new AskUserRuntime(() => undefined));
  mcps.push(restoredMcp);
  const restored = await restoredMcp.loadSession(
    created.sessionId,
    [],
    definition.prefix.tools,
    workspacePath,
  );
  expect(restored.configuration.stdio.restart).toEqual({
    delayMs: 4321,
    maxAttempts: 7,
  });
  expect(restored.tools.map(({ name }) => name)).toEqual(
    expect.arrayContaining([toolboxes.choice.name, toolboxes.open_ended.name]),
  );
});
