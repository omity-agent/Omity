import type { McpConnection, McpFailure } from "./failures/wireFormat";
import type { McpClientPool } from "./client/pool";
import type { McpConfiguration } from "./configuration";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { excludedServerToolNames } from "./configuration/exclusions";
import { langChainClient } from "./tools/langchain";
import { loadMcpTools } from "@langchain/mcp-adapters";
import pMap from "p-map";
import { parseMcpConnection } from "./configuration/connections";
import { reportMcpFailure } from "./failures/reportConstruction";

export async function loadServerTools(
  client: Pick<McpClientPool, "getClient">,
  servers: McpConfiguration["mcpServers"],
  cwd?: string,
) {
  const catalogs = await pMap(
    Object.entries(servers),
    ([name, configuration]) => loadServerCatalog(client, name, configuration, cwd),
    { stopOnError: false },
  );
  return catalogs.flat();
}
async function loadServerCatalog(
  client: Pick<McpClientPool, "getClient">,
  name: string,
  configuration: McpConfiguration["mcpServers"][string],
  cwd?: string,
): Promise<StructuredToolInterface[]> {
  const started = performance.now();
  let stage: McpFailure["stage"] = "initialize",
    connection: McpConnection | undefined;
  try {
    const serverClient = await client.getClient(name);
    connection = parseMcpConnection(configuration);
    stage = "list_tools";
    const excludedNames = new Set(excludedServerToolNames(name, configuration)),
      loaded = await loadMcpTools(name, langChainClient(serverClient), {
        prefixToolNameWithServerName: configuration.prefixToolNameWithServerName ?? true,
        throwOnLoadError: true,
      }),
      serverTools = loaded.filter((tool) => !excludedNames.has(tool.name));
    if (configuration.defer_loading) {
      for (const tool of serverTools) {
        tool.extras = { ...tool.extras, defer_loading: true };
      }
    }
    return serverTools;
  } catch (error) {
    throw reportMcpFailure(error, {
      connection,
      cwd,
      durationMs: performance.now() - started,
      server: name,
      stage,
    });
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
