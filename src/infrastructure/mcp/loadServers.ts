import type { McpClientPool } from "./client/pool";
import type { McpConfiguration } from "./configuration";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { collectReadableZodIssues } from "./tools/issues";
import { excludedServerToolNames } from "./configuration/exclusions";
import { langChainClient } from "./tools/langchain";
import { loadMcpTools } from "@langchain/mcp-adapters";
import pMap from "p-map";

export async function loadServerTools(
  client: Pick<McpClientPool, "getClient">,
  servers: McpConfiguration["mcpServers"],
) {
  try {
    const catalogs = await pMap(
      Object.entries(servers),
      ([name, configuration]) => loadServerCatalog(client, name, configuration),
      { stopOnError: false },
    );
    return catalogs.flat();
  } catch (error) {
    if (error instanceof AggregateError) {
      error.message = error.errors
        .map((failure: unknown) => (failure instanceof Error ? failure.message : String(failure)))
        .join("\n");
    }
    throw error;
  }
}
async function loadServerCatalog(
  client: Pick<McpClientPool, "getClient">,
  name: string,
  configuration: McpConfiguration["mcpServers"][string],
): Promise<StructuredToolInterface[]> {
  try {
    const serverClient = await client.getClient(name),
      excludedNames = new Set(excludedServerToolNames(name, configuration)),
      loaded = await loadMcpTools(name, langChainClient(serverClient), {
        prefixToolNameWithServerName: configuration.prefixToolNameWithServerName ?? true,
        throwOnLoadError: true,
        useStandardContentBlocks: true,
      }),
      serverTools = loaded.filter((tool) => !excludedNames.has(tool.name));
    if (configuration.defer_loading) {
      for (const tool of serverTools) {
        tool.extras = { ...tool.extras, defer_loading: true };
      }
    }
    return serverTools;
  } catch (error) {
    const issues = collectReadableZodIssues(error),
      message =
        issues.length > 0
          ? issues.join("\n")
          : error instanceof Error
            ? error.message
            : String(error);
    throw new Error(`MCP 服务器 "${name}" 初始化失败：${message}`, { cause: error });
  }
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
