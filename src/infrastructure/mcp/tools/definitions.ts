import type { LoadedMcp } from "./catalog";
import type { McpConfiguration } from "../configuration";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { configureFreeformMcpTools } from "./freeform";
import { toJsonSchema } from "@langchain/core/utils/json_schema";

export interface ModelToolDefinition {
  deferLoading?: boolean;
  description: string;
  freeform: boolean;
  inputSchema: ReturnType<typeof toJsonSchema>;
  name: string;
}
export interface McpToolSnapshot {
  tools: ModelToolDefinition[];
}
export function snapshotMcpTools(
  mcp: LoadedMcp,
  session: { cwd: string; session: string },
): McpToolSnapshot {
  const tools = mcp.modelTools(session);
  return {
    tools: modelToolDefinitions(tools, mcp.freeformToolParameters),
  };
}
export function modelToolDefinitions(
  tools: StructuredToolInterface[],
  freeformToolParameters: ReadonlyMap<string, string>,
): ModelToolDefinition[] {
  return tools.map((tool) => ({
    ...(tool.extras?.["defer_loading"] === true ? { deferLoading: true } : {}),
    description: tool.description,
    freeform: freeformToolParameters.has(tool.name),
    inputSchema: toJsonSchema(tool.schema),
    name: tool.name,
  }));
}
export function applyMcpToolSnapshot(tools: StructuredToolInterface[], snapshot: McpToolSnapshot) {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool])),
    frozenNames = new Set<string>();
  for (const definition of snapshot.tools) {
    if (frozenNames.has(definition.name)) {
      throw new Error(`会话冻结的 MCP 工具定义包含重复项：${definition.name}`);
    }
    frozenNames.add(definition.name);
    const tool = toolsByName.get(definition.name);
    if (!tool) {
      throw new Error(`会话冻结的 MCP 工具不存在：${definition.name}`);
    }
    tool.extras = { ...tool.extras, defer_loading: definition.deferLoading === true };
  }
  const freeformToolParameters = configureFreeformMcpTools(
    tools,
    snapshot.tools.filter(({ freeform }) => freeform).map(({ name }) => name),
  ).parameters;
  return { freeformToolParameters, tools };
}
export function emptyMcpToolSnapshot(): McpToolSnapshot {
  return {
    tools: [],
  };
}
export function emptyMcp(configuration: McpConfiguration, snapshot?: McpToolSnapshot): LoadedMcp {
  const configured = snapshot
    ? applyMcpToolSnapshot([], snapshot)
    : { freeformToolParameters: new Map<string, string>(), tools: [] };
  return {
    close: () => Promise.resolve(),
    configuration,
    freeformToolParameters: configured.freeformToolParameters,
    modelTools: () => configured.tools,
    tools: configured.tools,
  };
}
