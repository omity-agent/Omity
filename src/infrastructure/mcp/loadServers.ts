import type { McpConfiguration } from "./configuration";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { createMcpToolFailureClient } from "./tools/invocation";
import { loadMcpTools } from "@langchain/mcp-adapters";

export async function loadServerTools(
  client: {
    getClient: (name: string) => Promise<object | undefined>;
  },
  names: string[],
  deferredServers: ReadonlySet<string> = new Set(),
) {
  const tools: StructuredToolInterface[] = [];
  for (const name of names) {
    const serverClient = await client.getClient(name);
    if (serverClient === undefined) {
      throw new Error(`MCP 服务器客户端未建立：${name}`);
    }
    const serverTools = await loadMcpTools(name, createMcpToolFailureClient(serverClient), {
      prefixToolNameWithServerName: true,
      throwOnLoadError: false,
      useStandardContentBlocks: true,
    });
    if (deferredServers.has(name)) {
      for (const tool of serverTools) {
        tool.extras = { ...tool.extras, defer_loading: true };
      }
    }
    tools.push(...serverTools);
  }
  return tools;
}
export function validateConfiguredServers(
  configuration: McpConfiguration,
  names: string[],
  builtInToolNames: string[],
) {
  if (names.length > 0 || builtInToolNames.length > 0) {
    return;
  }
  if (Object.keys(configuration.toolNameOverrides).length > 0) {
    throw new Error("MCP 工具重命名配置需要至少配置一个 MCP 服务器");
  }
  if (Object.keys(configuration.toolDescriptionOverrides).length > 0) {
    throw new Error("MCP 工具描述覆盖配置需要至少配置一个 MCP 服务器");
  }
  if (configuration.freeformToolInputs.length > 0) {
    throw new Error("MCP free-form 工具配置需要至少配置一个 MCP 服务器");
  }
}
