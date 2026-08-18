import { type AppMcp, createAppMcp } from "../../src/app/runtime/mcp";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { AskUserRuntime } from "../../src/infrastructure/toolbox/runtime";
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
  definition.systemPrompt = " \n";
  db.resetSession("empty-instructions", workspace, [], definition);
  db.appendUser("empty-instructions", "message");
  const transcript = loadTranscript(db, "empty-instructions");
  expect(buildTimeline(transcript.messages, transcript.queue, []).map(({ role }) => role)).toEqual([
    "user",
  ]);
  db.close();
});
test("session snapshots keep prompts and tools after configuration changes", async () => {
  const root = createTestDirectory("session-snapshot");
  roots.push(root);
  writeTestConfiguration(root, { systemPrompt: "locked prompt" });
  writeFileSync(
    join(root, "settings", "toolbox.yaml"),
    "toolboxes:\n  ask_user:\n    enabled: true\n",
  );
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
  writeFileSync(join(root, "settings", "toolbox.yaml"), "[]\n");
  expect(definition.systemPrompt).toBe("locked prompt\n\nuse skills");
  expect(definition.mcp.tools.map(({ name }) => name)).toContain("ask_user__open_ended");
  const prepared = prepareHostSession({ kind: "load", sessionId: created.sessionId }, root, {
    cwd: workspacePath,
    settingsContext: context,
  });
  databases.push(prepared.db);
  expect(prepared.settings.agent.systemPrompt).toBe(definition.systemPrompt);
  const restoredMcp = createAppMcp(root, "debug", context, new AskUserRuntime(() => undefined));
  mcps.push(restoredMcp);
  const restored = await restoredMcp.loadSession(created.sessionId, definition.mcp);
  expect(restored.tools.map(({ name }) => name)).toEqual(
    expect.arrayContaining(["ask_user__choice", "ask_user__open_ended"]),
  );
});
