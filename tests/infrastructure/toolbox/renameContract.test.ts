import { afterEach, expect, test } from "bun:test";
import {
  closeDatabase,
  queryGet,
  removeDatabaseDirectory,
} from "../../../src/infrastructure/database/connection";
import { defaultBuiltIns, toolProperties } from "../../support/builtins";
import {
  resolveSessionPaths,
  sessionPaths,
} from "../../../src/infrastructure/configuration/sessionPaths";
import { AgentDatabase } from "../../../src/infrastructure/database/agentDatabase";
import { Database } from "bun:sqlite";
import { createTitleTool } from "../../../src/infrastructure/toolbox/updateTitle";
import { createToolInvoker } from "../../../src/agent/toolExecution";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { testSettings } from "../../support/settings";
import { toJsonSchema } from "@langchain/core/utils/json_schema";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    removeDatabaseDirectory(directory);
  }
});
function fixture() {
  const id = randomUUID(),
    paths = sessionPaths(id),
    db = new AgentDatabase(paths.dbPath);
  directories.push(paths.dir);
  try {
    db.createSession(id, process.cwd());
  } finally {
    db.close();
  }
  return { id, paths };
}
function title(id: string) {
  const db = new Database(resolveSessionPaths(id).dbPath, { readonly: true });
  try {
    return queryGet<{ title: string }>(db, "SELECT title FROM sessions WHERE id = ?", id)?.title;
  } finally {
    closeDatabase(db);
  }
}
test("title tool declares exactly one string parameter and persists only its current session", async () => {
  const first = fixture(),
    second = fixture(),
    changed: string[] = [],
    tool = createTitleTool(defaultBuiltIns().update_title!, (id) => {
      changed.push(id);
      expect(title(id)).toBe("设计会话标题");
    }),
    schema = toJsonSchema(tool.schema);
  expect(title(first.id)).toBe(first.id);
  expect(schema).toMatchObject({
    additionalProperties: false,
    properties: { title: { type: "string" } },
    required: ["title"],
    type: "object",
  });
  expect(Object.keys(toolProperties(tool))).toEqual(["title"]);
  expect(
    await tool.invoke(
      { title: "  设计会话标题  " },
      {
        configurable: { sessionId: first.id },
      },
    ),
  ).toBe("ok");
  expect(changed).toEqual([first.id]);
  expect(title(first.id)).toBe("设计会话标题");
  expect(title(second.id)).toBe(second.id);
});
test.each(["", " \n\t ", "一", "😀", "👨‍👩‍👧‍👦", "e\u0301", "字".repeat(41)])(
  "invalid visible title length is rejected without updating: %j",
  async (input) => {
    const { id } = fixture(),
      changed: string[] = [],
      tool = createTitleTool(defaultBuiltIns().update_title!, (value) => {
        changed.push(value);
      });
    expect(tool.invoke({ title: input }, { configurable: { sessionId: id } })).rejects.toThrow(
      "2–40",
    );
    expect(title(id)).toBe(id);
    expect(changed).toEqual([]);
  },
);
test.each(["标题", "字".repeat(40), "😀".repeat(40), "👨‍👩‍👧‍👦好", "e\u0301好"])(
  "valid grapheme lengths include both boundaries: %j",
  async (input) => {
    const { id } = fixture(),
      tool = createTitleTool(defaultBuiltIns().update_title!);
    expect(await tool.invoke({ title: input }, { configurable: { sessionId: id } })).toBe("ok");
    expect(title(id)).toBe(input);
  },
);
test("configured limits govern execution while parameter descriptions remain unchanged", async () => {
  const { id } = fixture(),
    settings = defaultBuiltIns().update_title!;
  settings.parameters.title.minLength = 3;
  settings.parameters.title.maxLength = 3;
  const tool = createTitleTool(settings);
  expect(toolProperties(tool)["title"]).toMatchObject({
    description: settings.parameters.title.description,
  });
  expect(tool.invoke({ title: "标题" }, { configurable: { sessionId: id } })).rejects.toThrow(
    "3–3",
  );
  expect(await tool.invoke({ title: "新标题" }, { configurable: { sessionId: id } })).toBe("ok");
});
test("missing context, extra arguments, canceled calls and missing databases cannot write", async () => {
  const { id } = fixture(),
    tool = createTitleTool(defaultBuiltIns().update_title!);
  expect(tool.invoke({ title: "标题" })).rejects.toThrow("会话 ID");
  expect(
    tool.invoke(
      {
        args: { title: 42 },
        id: "invalid",
        name: tool.name,
        type: "tool_call",
      },
      { configurable: { sessionId: id } },
    ),
  ).rejects.toThrow();
  expect(
    tool.invoke(
      { sessionId: "other", title: "标题" },
      {
        configurable: { sessionId: id },
      },
    ),
  ).rejects.toThrow();
  expect(
    tool.invoke(
      { title: "标题" },
      {
        configurable: { sessionId: id },
        signal: AbortSignal.abort(new Error("canceled")),
      },
    ),
  ).rejects.toThrow("canceled");
  const missing = randomUUID(),
    path = resolveSessionPaths(missing).dir;
  expect(
    tool.invoke(
      { title: "标题" },
      {
        configurable: { sessionId: missing },
      },
    ),
  ).rejects.toThrow();
  expect(existsSync(path)).toBe(false);
  expect(title(id)).toBe(id);
});
test("agent invocation returns ok or an error ToolMessage", async () => {
  const { id } = fixture(),
    tool = createTitleTool(defaultBuiltIns().update_title!),
    invoke = createToolInvoker([tool], {
      freeformToolParameters: new Map(),
      sessionId: id,
      settings: testSettings(),
    });
  expect(await invoke({ args: { title: "标题" }, id: "valid", name: tool.name }, {})).toMatchObject(
    { content: "ok", status: "success" },
  );
  expect(await invoke({ args: { title: "" }, id: "invalid", name: tool.name }, {})).toMatchObject({
    content: expect.stringContaining("2–40"),
    status: "error",
  });
  expect(title(id)).toBe("标题");
});
