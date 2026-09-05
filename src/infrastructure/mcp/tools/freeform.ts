import { type SessionPlaceholders, resolvePlaceholders } from "../../configuration/placeholders";
import { hasSessionDescription, sessionDescription } from "./descriptions";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";

interface FreeformMcpTools {
  parameters: ReadonlyMap<string, string>;
}
const toolJsonSchema = z.looseObject({
    properties: z.record(z.string(), z.unknown()),
  }),
  stringParameterSchema = z.looseObject({ type: z.literal("string") });
export function configureFreeformMcpTools(
  tools: StructuredToolInterface[],
  names: string[],
): FreeformMcpTools {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool])),
    parameters = new Map<string, string>();
  for (const name of names) {
    const tool = toolsByName.get(name);
    if (!tool) {
      throw new Error(`MCP free-form 工具配置引用了不存在的工具：${name}`);
    }
    parameters.set(name, singleStringParameter(tool));
  }
  return {
    parameters,
  };
}
export function sessionModelTools(
  tools: StructuredToolInterface[],
  _parameters: ReadonlyMap<string, string>,
  session: Required<SessionPlaceholders>,
) {
  return tools.map((tool) => {
    if (!hasSessionDescription(tool)) {
      return tool;
    }
    const description = resolveDescription(sessionDescription(tool), tool.name, session);
    tool.description = description;
    return tool;
  });
}
function singleStringParameter(tool: StructuredToolInterface) {
  const { schema } = tool,
    parsed = toolJsonSchema.safeParse(schema),
    entries = parsed.success ? Object.entries(parsed.data.properties) : [];
  if (entries.length !== 1) {
    throw new Error(
      `MCP free-form 工具 ${tool.name} 必须恰好声明一个输入参数，实际为 ${entries.length.toString()} 个`,
    );
  }
  const [entry] = entries;
  if (!entry) {
    throw new Error(`MCP free-form 工具 ${tool.name} 缺少输入参数`);
  }
  const [parameter, definition] = entry;
  if (!parameter) {
    throw new Error(`MCP free-form 工具 ${tool.name} 的输入参数名不能为空`);
  }
  if (!stringParameterSchema.safeParse(definition).success) {
    throw new Error(`MCP free-form 工具 ${tool.name} 的唯一输入参数 ${parameter} 必须是字符串`);
  }
  return parameter;
}
function resolveDescription(
  description: string,
  name: string,
  session: Required<SessionPlaceholders>,
) {
  const resolved = resolvePlaceholders(description, {
    session,
    source: `MCP 工具 ${name} 的描述`,
  });
  if (typeof resolved !== "string") {
    throw new Error(`MCP 工具 ${name} 的描述必须解析为字符串`);
  }
  return resolved;
}
