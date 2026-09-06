import { defaultBuiltIns, toolProperties, writeToolboxConfiguration } from "../../support/builtins";
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  parseMcpConfiguration,
  readProfileMcpConfiguration,
} from "../../../src/infrastructure/mcp/configuration";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { loadBuiltInTools } from "../../../src/infrastructure/toolbox/loadBuiltIns";

test("ask_user descriptions remain empty, including all parameter descriptions", () => {
  const tools = loadBuiltInTools(defaultBuiltIns(), {});
  for (const tool of tools.filter(({ name }) => name.startsWith("ask_user__"))) {
    expect(tool.description).toBe("");
    for (const parameter of Object.values(toolProperties(tool))) {
      expect(parameter).toMatchObject({ description: "" });
    }
  }
  expect(tools.map(({ name }) => name)).toEqual([
    "ask_user__choice",
    "ask_user__open_ended",
    "update_title",
  ]);
});
test("each built-in can be disabled independently", () => {
  const settings = defaultBuiltIns();
  for (const key of ["choice", "open_ended", "update_title"] as const) {
    settings[key]!.enabled = false;
    expect(loadBuiltInTools(settings, {}).some(({ name }) => name === settings[key]!.name)).toBe(
      false,
    );
  }
  expect(loadBuiltInTools({}, {})).toEqual([]);
});
test("default and profile layers configure names, descriptions and validation together", async () => {
  const root = createTestDirectory("builtin-layers"),
    user = join(root, "user"),
    profile = join(user, "profiles", "custom");
  mkdirSync(join(root, "settings"));
  mkdirSync(profile, { recursive: true });
  writeToolboxConfiguration(root, {
    toolboxes: {
      choice: {
        description: "默认描述",
        name: "pick",
        parameters: { question: { minLength: 3 } },
      },
    },
  });
  writeFileSync(join(user, "profile.yaml"), "- custom\n");
  writeFileSync(
    join(profile, "toolbox.yaml"),
    `toolboxes:
  choice:
    description: 配置集描述
    parameters:
      question:
        description: 配置集参数
  update_title:
    parameters:
      title:
        maxLength: 10
`,
  );
  try {
    const configuration = readProfileMcpConfiguration(createSettingsContext(root, user))!,
      tools = loadBuiltInTools(configuration.toolboxes, { askUser: async () => "answer" }),
      choice = tools.find(({ name }) => name === "pick")!;
    expect(choice.description).toBe("配置集描述");
    expect(toolProperties(choice)["question"]).toMatchObject({
      description: "配置集参数",
      minLength: 3,
    });
    expect(configuration.toolboxes.update_title!.parameters.title).toMatchObject({
      maxLength: 10,
      minLength: 2,
    });
    expect(choice.invoke({ multiple: false, options: [], question: "短" })).rejects.toThrow();
  } finally {
    rmSync(root, { recursive: true });
  }
});
test.each([
  { maxLength: 40, minLength: 0 },
  { maxLength: 2, minLength: 3 },
  { maxLength: 2.5, minLength: 2 },
  { maxLength: Number.MAX_SAFE_INTEGER + 1, minLength: 2 },
])("invalid title bounds are rejected in configuration: %j", (bounds) => {
  const toolboxes = defaultBuiltIns();
  Object.assign(toolboxes.update_title!.parameters.title, bounds);
  expect(() => parseMcpConfiguration({ toolboxes }, "toolbox.yaml")).toThrow();
});
