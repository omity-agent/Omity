import { afterEach, expect, test } from "bun:test";
import {
  applySessionDefinition,
  createSessionDefinition,
} from "../../src/infrastructure/database/sessionDefinition";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { appendAssistantMessage } from "../../src/infrastructure/database/records/messages/history";
import { emptyMcp } from "../../src/infrastructure/mcp/tools/definitions";
import { emptyMcpConfiguration } from "../../src/infrastructure/mcp/configuration";
import { forkDatabaseBeforeMessage } from "../../src/app/fork";
import { readDefinitionRecord } from "../../src/infrastructure/database/records/sessions";
import { testSettings } from "../support/settings";

afterEach(cleanupDatabaseDirs);
const settings = testSettings();
settings.hooks = [
  {
    args: {},
    id: "notify",
    mode: "silent",
    runLimit: -1,
    target: "agent",
    tool: "notify",
    when: "after",
  },
];
function definition(overrides?: Record<string, boolean>) {
  return createSessionDefinition(
    settings,
    emptyMcp(emptyMcpConfiguration()),
    { cwd: workspace, session: workspace },
    overrides,
  );
}
test("session Hook overrides are optional and reject unknown IDs", () => {
  expect(applySessionDefinition(settings, definition()).hooks).toEqual(settings.hooks);
  expect(() => definition({ unknown: false })).toThrow(
    expect.objectContaining({ code: "HOOK_SELECTION_INVALID" }),
  );
});
test("session Hook choices persist without freezing rules or changing configuration", () => {
  const snapshot = definition({ notify: false }),
    current = {
      ...settings,
      hooks: settings.hooks.map((rule) => ({ ...rule, args: { updated: true } })),
    };
  expect(applySessionDefinition(current, snapshot).hooks).toEqual([
    { ...required(settings.hooks[0]), args: { updated: true }, enable: false },
  ]);
  expect(settings.hooks[0]?.enable).toBeUndefined();
  expect(applySessionDefinition({ ...current, hooks: [] }, snapshot).hooks).toEqual([]);
});
test("Fork inherits session Hook choices", () => {
  const source = makeDb(),
    target = makeDb();
  try {
    source.createSession("source", workspace, [], definition({ notify: false }));
    const first = source.appendUser("source", "first");
    source.startQueue("source", required(source.nextQueue("source")));
    appendAssistantMessage(source.db, "source", "reply");
    source.setQueueStatus(first, "done");
    const second = source.appendUser("source", "second");
    source.startQueue("source", required(source.nextQueue("source")));
    const forkPoint = required(
      source.db
        .query<{ id: number }, [number]>("SELECT id FROM messages WHERE queue_id = ?")
        .get(second),
    );
    forkDatabaseBeforeMessage({
      beforeMessageId: forkPoint.id,
      profiles: [],
      source,
      sourceSessionId: "source",
      target,
      targetSessionId: "target",
      workspace,
    });
    const snapshot = readDefinitionRecord(target.db, "target");
    expect(snapshot.hookOverrides).toEqual({ notify: false });
    expect(applySessionDefinition(settings, snapshot).hooks[0]?.enable).toBeFalse();
  } finally {
    source.close();
    target.close();
  }
});
