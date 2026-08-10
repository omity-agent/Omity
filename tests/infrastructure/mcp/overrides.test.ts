import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  normalizeMcpToolDescriptionOverrides,
  overrideMcpToolDescriptions,
  renameMcpTools,
} from "../../../src/infrastructure/mcp/toolOverrides";
import {
  parseMcpConfiguration,
  readMcpConfiguration,
} from "../../../src/infrastructure/mcp/config";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { readLayeredSettingsYaml } from "../../../src/infrastructure/configuration/settings/files";
import { sessionModelTools } from "../../../src/infrastructure/mcp/freeformInputs";

test("user MCP settings deeply override repository defaults", () => {
  const root = createTestDirectory("mcp-layered-config"),
    userSettings = join(root, "user-settings");
  try {
    mkdirSync(join(root, "settings"), { recursive: true });
    const profile = join(userSettings, "profiles", "tools");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(userSettings, "profile.yaml"), "- tools\n");
    writeFileSync(
      join(root, "settings", "toolbox.yaml"),
      `mcpServers:\n  terminal:\n    transport: stdio\n    command: terminal\n    args: [default]\ntoolNameOverrides:\n  terminal__open: open\nfreeformToolInputs: [open]\n`,
    );
    writeFileSync(
      join(profile, "toolbox.yaml"),
      `mcpServers:\n  terminal:\n    args: [user]\ntoolNameOverrides:\n  terminal__close: close\nfreeformToolInputs: [close]\n`,
    );
    const file = readLayeredSettingsYaml(
      createSettingsContext(root, userSettings),
      "profile",
      "toolbox.yaml",
    );
    expect(file).toBeDefined();
    const configuration = parseMcpConfiguration(file?.value, file?.path ?? "toolbox.yaml");
    expect(configuration.mcpServers["terminal"]).toMatchObject({
      args: ["user"],
      command: "terminal",
    });
    expect(configuration.toolNameOverrides).toEqual({
      terminal__close: "close",
      terminal__open: "open",
    });
    expect(configuration.freeformToolInputs).toEqual(["close"]);
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("MCP config reads tool description override paths", () => {
  const root = createTestDirectory("mcp-description-config"),
    path = join(root, "toolbox.yaml");
  try {
    writeFileSync(
      path,
      "toolDescriptionOverrides:\n  search: settings/tool-descriptions/search.md\n",
    );
    expect(readMcpConfiguration(path).toolDescriptionOverrides).toEqual({
      search: "settings/tool-descriptions/search.md",
    });
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("MCP tool descriptions are loaded from configured paths after renaming", () => {
  const root = createTestDirectory("mcp-description");
  try {
    const directory = join(root, "settings", "tool-descriptions");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "search.md"),
      "Search the current web.\n\nUse precise terms.  \n",
    );
    const tools = renameMcpTools([tool("web__search")], { web__search: "search" });
    overrideMcpToolDescriptions(tools, { search: "settings/tool-descriptions/search.md" }, root);
    expect(tools[0]?.description).toBe("Search the current web.\n\nUse precise terms.");
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("MCP tool description overrides reject missing tools", () => {
  expect(() =>
    overrideMcpToolDescriptions([tool("web__search")], { missing: "missing.md" }, "."),
  ).toThrow("MCP 工具描述覆盖配置引用了不存在的工具：missing");
});
test("MCP tool description overrides reject empty files", () => {
  const root = createTestDirectory("mcp-empty-description");
  try {
    const path = join(root, "empty.md");
    writeFileSync(path, " \n");
    expect(() => overrideMcpToolDescriptions([tool("search")], { search: path }, root)).toThrow(
      `MCP 工具 search 的描述覆盖文件不能为空：${path}`,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("MCP tool descriptions resolve session placeholders per model binding", () => {
  const root = createTestDirectory("mcp-session-description");
  try {
    const path = join(root, "settings", "prompts", "description.md");
    mkdirSync(join(root, "settings", "prompts"), { recursive: true });
    const template = `workspace=\${cwd}\nsession=\${session}`;
    writeFileSync(path, `${template}\n`);
    const tools = [tool("search")];
    overrideMcpToolDescriptions(tools, { search: path }, root);
    expect(tools[0]?.description).toBe(template);
    const [modelTool] = sessionModelTools(tools, new Map(), {
      cwd: join(root, "workspace"),
      session: join(root, "sessions", "abc"),
    });
    expect(modelTool?.description).toBe(
      `workspace=${join(root, "workspace").replaceAll("\\", "/")}\nsession=${join(
        root,
        "sessions",
        "abc",
      ).replaceAll("\\", "/")}`,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("MCP tool descriptions reject session placeholders outside settings prompts", () => {
  const root = createTestDirectory("mcp-session-description");
  try {
    const path = join(root, "description.md");
    writeFileSync(path, `session=\${session}\n`);
    try {
      overrideMcpToolDescriptions([tool("search")], { search: path }, root);
      throw new Error("没有拒绝会话占位符");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toHaveProperty(
        "cause.message",
        expect.stringContaining(`会话占位符 \${session} 没有可用值`),
      );
    }
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("MCP tool description override paths must be non-empty strings", () => {
  expect(() => normalizeMcpToolDescriptionOverrides({ search: "" })).toThrow(
    "MCP 工具描述覆盖配置 settings/toolbox.yaml.toolDescriptionOverrides.search 必须是非空路径",
  );
});
function tool(name: string) {
  return new DynamicStructuredTool({
    description: "Original description",
    func: () => Promise.resolve("ok"),
    name,
    schema: {
      additionalProperties: false,
      properties: {},
      type: "object" as const,
    },
  });
}
