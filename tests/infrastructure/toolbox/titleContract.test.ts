import { defaultBuiltIns, toolProperties } from "../../support/builtins";
import { expect, test } from "bun:test";
import { createTitleTool } from "../../../src/infrastructure/toolbox/validateTitle";
import { createToolInvoker } from "../../../src/agent/toolExecution";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolveSessionPaths } from "../../../src/infrastructure/configuration/sessionPaths";
import { testSettings } from "../../support/settings";
import { toJsonSchema } from "@langchain/core/utils/json_schema";

const settings = defaultBuiltIns().update_title!,
  { minLength, maxLength } = settings.parameters.title,
  validTitle = "字".repeat(minLength),
  range = `${minLength}–${maxLength}`;

test("title validation declares one string parameter and has no database side effects", async () => {
  const tool = createTitleTool(settings),
    sessionId = randomUUID(),
    path = resolveSessionPaths(sessionId).dir;
  expect(toJsonSchema(tool.schema)).toMatchObject({
    additionalProperties: false,
    properties: { title: { type: "string" } },
    required: ["title"],
    type: "object",
  });
  expect(Object.keys(toolProperties(tool))).toEqual(["title"]);
  expect(Reflect.get(tool, "metadata")).toMatchObject({ builtInTool: "update_title" });
  expect(await tool.invoke({ title: `  ${validTitle}  ` }, { configurable: { sessionId } })).toBe(
    "ok",
  );
  expect(existsSync(path)).toBe(false);
});
test.each([
  "",
  " \n\t ",
  ...["一", "😀", "👨‍👩‍👧‍👦", "e\u0301"].map((grapheme) => grapheme.repeat(minLength - 1)),
  "字".repeat(maxLength + 1),
])("invalid visible title length is rejected: %j", async (input) => {
  const tool = createTitleTool(settings);
  expect(tool.invoke({ title: input })).rejects.toThrow(range);
});
test.each(
  ["字", "😀", "👨‍👩‍👧‍👦", "e\u0301"].flatMap((grapheme) =>
    [minLength, maxLength].map((length) => grapheme.repeat(length)),
  ),
)("valid grapheme lengths include both boundaries: %j", async (input) => {
  expect(await createTitleTool(settings).invoke({ title: input })).toBe("ok");
});
test("configured limits govern execution while parameter descriptions remain unchanged", async () => {
  const custom = defaultBuiltIns().update_title!;
  custom.parameters.title.minLength = 3;
  custom.parameters.title.maxLength = 3;
  const tool = createTitleTool(custom);
  expect(toolProperties(tool)["title"]).toMatchObject({
    description: custom.parameters.title.description,
  });
  expect(tool.invoke({ title: "标题" })).rejects.toThrow("3–3");
  expect(await tool.invoke({ title: "新标题" })).toBe("ok");
});
test("extra arguments, invalid types and canceled calls are rejected", async () => {
  const tool = createTitleTool(settings);
  expect(
    tool.invoke({ args: { title: 42 }, id: "invalid", name: tool.name, type: "tool_call" }),
  ).rejects.toThrow();
  expect(tool.invoke({ sessionId: "other", title: validTitle })).rejects.toThrow();
  expect(
    tool.invoke({ title: validTitle }, { signal: AbortSignal.abort(new Error("canceled")) }),
  ).rejects.toThrow("canceled");
});
test("agent invocation identifies successful title results even after a tool rename", async () => {
  const tool = createTitleTool(settings);
  tool.name = "renamed_heading";
  const invoke = createToolInvoker([tool], {
    freeformToolParameters: new Map(),
    sessionId: "session",
    settings: testSettings(),
  });
  expect(
    await invoke({ args: { title: validTitle }, id: "valid", name: tool.name }, {}),
  ).toMatchObject({
    content: "ok",
    metadata: { builtInTool: "update_title" },
    name: tool.name,
    status: "success",
  });
  expect(await invoke({ args: { title: "" }, id: "invalid", name: tool.name }, {})).toMatchObject({
    content: expect.stringContaining(range),
    status: "error",
  });
});
