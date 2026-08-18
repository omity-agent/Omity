import type { LoadedMcp } from "./loadTools";
import type { McpConfiguration } from "./config";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { toJsonSchema } from "@langchain/core/utils/json_schema";

export interface ModelToolDefinition {
  description: string;
  freeform: boolean;
  inputSchema: ReturnType<typeof toJsonSchema>;
  name: string;
}
export interface McpSnapshot {
  configuration: McpConfiguration;
  freeformToolParameters: [string, string][];
  tools: ModelToolDefinition[];
}
export function snapshotMcp(
  mcp: LoadedMcp,
  session: { cwd: string; session: string },
): McpSnapshot {
  const tools = mcp.modelTools(session);
  return {
    configuration: mcp.configuration,
    freeformToolParameters: [...mcp.freeformToolParameters],
    tools: modelToolDefinitions(tools, mcp.freeformToolParameters),
  };
}
export function modelToolDefinitions(
  tools: StructuredToolInterface[],
  freeformToolParameters: ReadonlyMap<string, string>,
): ModelToolDefinition[] {
  return tools.map((tool) => ({
    description: tool.description,
    freeform: freeformToolParameters.has(tool.name),
    inputSchema: toJsonSchema(tool.schema),
    name: tool.name,
  }));
}
export function applyMcpSnapshot(tools: StructuredToolInterface[], snapshot: McpSnapshot) {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool])),
    frozenTools = snapshot.tools.map((definition) => {
      const tool = toolsByName.get(definition.name);
      if (!tool) {
        throw new Error(`会话冻结的 MCP 工具不存在：${definition.name}`);
      }
      tool.description = definition.description;
      return tool;
    }),
    freeformToolParameters = new Map(snapshot.freeformToolParameters);
  if (freeformToolParameters.size !== snapshot.freeformToolParameters.length) {
    throw new Error("会话冻结的 MCP free-form 工具定义包含重复项");
  }
  for (const [name] of freeformToolParameters) {
    const definition = snapshot.tools.find((tool) => tool.name === name);
    if (!definition?.freeform) {
      throw new Error(`会话冻结的 MCP free-form 工具不存在：${name}`);
    }
  }
  return { freeformToolParameters, tools: frozenTools };
}
export function emptyMcpSnapshot(): McpSnapshot {
  return {
    configuration: {
      freeformToolInputs: [],
      mcpServers: {},
      stdio: { restart: { delayMs: 1000, maxAttempts: 3 } },
      toolDescriptionOverrides: {},
      toolNameOverrides: {},
      toolboxes: { ask_user: { enabled: false } },
    },
    freeformToolParameters: [],
    tools: [],
  };
}
export function emptyMcp(configuration: McpConfiguration, snapshot?: McpSnapshot): LoadedMcp {
  const configured = snapshot
    ? applyMcpSnapshot([], snapshot)
    : { freeformToolParameters: new Map<string, string>(), tools: [] };
  return {
    close: () => Promise.resolve(),
    configuration,
    freeformToolParameters: configured.freeformToolParameters,
    modelTools: () => configured.tools,
    tools: configured.tools,
  };
}
