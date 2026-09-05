import { isAbsolute, relative, resolve } from "node:path";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { readSettingsText } from "../../configuration/placeholders";
import { resolveConfiguredPath } from "../../configuration/configuredPath";

type McpToolNameOverrides = Record<string, string>;
type McpToolDescriptionOverrides = Record<string, string>;
const sessionDescriptions = new WeakMap<StructuredToolInterface, string>();
export function renameMcpTools(tools: StructuredToolInterface[], overrides: McpToolNameOverrides) {
  const toolsByName = indexMcpTools(tools),
    names = new Map(Object.entries(overrides));
  for (const from of names.keys()) {
    if (!toolsByName.has(from)) {
      throw new Error(`MCP 工具重命名配置引用了不存在的工具：${from}`);
    }
  }
  const finalNames = new Set<string>();
  for (const tool of tools) {
    const name = names.get(tool.name) ?? tool.name;
    if (finalNames.has(name)) {
      throw new Error(`MCP 工具重命名后名称冲突：${name}`);
    }
    finalNames.add(name);
  }
  for (const tool of tools) {
    tool.name = names.get(tool.name) ?? tool.name;
  }
  return tools;
}
export function overrideMcpToolDescriptions(
  tools: StructuredToolInterface[],
  overrides: McpToolDescriptionOverrides,
  root: string,
  sessionPromptRoots = [resolve(root, "settings", "prompts")],
) {
  const toolsByName = indexMcpTools(tools),
    descriptions = new Map<string, { allowSession: boolean; value: string }>();
  for (const [name, configuredPath] of Object.entries(overrides)) {
    if (!toolsByName.has(name)) {
      throw new Error(`MCP 工具描述覆盖配置引用了不存在的工具：${name}`);
    }
    const path = resolveConfiguredPath(root, configuredPath),
      allowSession = sessionPromptRoots.some((directory) => isWithin(directory, path));
    let description: string;
    try {
      description = readSettingsText(path, { deferSession: allowSession }).trimEnd();
    } catch (error) {
      throw new Error(`无法读取 MCP 工具 ${name} 的描述覆盖文件：${path}`, { cause: error });
    }
    if (description.length === 0) {
      throw new Error(`MCP 工具 ${name} 的描述覆盖文件不能为空：${path}`);
    }
    descriptions.set(name, { allowSession, value: description });
  }
  for (const [name, description] of descriptions) {
    const tool = toolsByName.get(name);
    if (!tool) {
      throw new Error(`MCP 工具描述覆盖配置引用了不存在的工具：${name}`);
    }
    tool.description = description.value;
    if (description.allowSession) {
      sessionDescriptions.set(tool, description.value);
    }
  }
  return tools;
}
export function hasSessionDescription(tool: StructuredToolInterface) {
  return sessionDescriptions.has(tool);
}
export function sessionDescription(tool: StructuredToolInterface) {
  const description = sessionDescriptions.get(tool);
  if (description === undefined) {
    throw new Error(`MCP 工具没有会话级描述：${tool.name}`);
  }
  return description;
}
function isWithin(parent: string, path: string) {
  const child = relative(parent, path);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}
function indexMcpTools(tools: StructuredToolInterface[]) {
  const toolsByName = new Map<string, StructuredToolInterface>();
  for (const tool of tools) {
    if (toolsByName.has(tool.name)) {
      throw new Error(`MCP 工具名称重复：${tool.name}`);
    }
    toolsByName.set(tool.name, tool);
  }
  return toolsByName;
}
