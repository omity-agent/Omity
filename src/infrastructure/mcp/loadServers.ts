import type { McpConnection, McpFailure } from "./failures/wireFormat";
import type { McpClientPool } from "./client/pool";
import type { McpConfiguration } from "./configuration";
import type { SettingsContext } from "../configuration/settings/context";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { configureFreeformMcpTools } from "./tools/freeform";
import { langChainClient } from "./tools/langchain";
import { loadMcpTools } from "@langchain/mcp-adapters";
import { overrideMcpToolDescriptions } from "./tools/descriptions";
import pMap from "p-map";
import { parseMcpConnection } from "./configuration/connections";
import { reportMcpFailure } from "./failures/reportConstruction";
import { resolve } from "node:path";

interface ServerCatalog {
  freeformToolParameters: ReadonlyMap<string, string>;
  tools: StructuredToolInterface[];
}
interface ServerLoadOptions {
  context: SettingsContext;
  customize: boolean;
  cwd?: string;
}
export async function loadServerTools(
  client: Pick<McpClientPool, "getClient">,
  servers: McpConfiguration["mcpServers"],
  options: ServerLoadOptions,
) {
  const catalogs = await pMap(
    Object.entries(servers),
    ([name, configuration]) => loadServerCatalog(client, name, configuration, options),
    { stopOnError: false },
  );
  return {
    freeformToolParameters: new Map(
      catalogs.flatMap((catalog) => [...catalog.freeformToolParameters]),
    ),
    tools: catalogs.flatMap((catalog) => catalog.tools),
  };
}
async function loadServerCatalog(
  client: Pick<McpClientPool, "getClient">,
  name: string,
  configuration: McpConfiguration["mcpServers"][string],
  options: ServerLoadOptions,
): Promise<ServerCatalog> {
  const started = performance.now();
  let stage: McpFailure["stage"] = "initialize",
    connection: McpConnection | undefined;
  try {
    const serverClient = await client.getClient(name);
    connection = parseMcpConnection(configuration);
    stage = "list_tools";
    const excludedNames = new Set(configuration.excludedTools),
      loaded = await loadMcpTools(name, langChainClient(serverClient), {
        prefixToolNameWithServerName: false,
        throwOnLoadError: true,
      }),
      serverTools = loaded.filter((tool) => !excludedNames.has(tool.name));
    stage = "customization";
    const parameters = options.customize
        ? configureServerTools(serverTools, configuration, options.context)
        : new Map<string, string>(),
      prefixedName = (tool: string) =>
        configuration.prefixToolNameWithServerName === false ? tool : `${name}__${tool}`;
    for (const tool of serverTools) {
      tool.name = prefixedName(tool.name);
    }
    if (configuration.defer_loading) {
      for (const tool of serverTools) {
        tool.extras = { ...tool.extras, defer_loading: true };
      }
    }
    return {
      freeformToolParameters: new Map(
        [...parameters].map(([tool, parameter]) => [prefixedName(tool), parameter]),
      ),
      tools: serverTools,
    };
  } catch (error) {
    throw reportMcpFailure(error, {
      connection,
      cwd: options.cwd,
      durationMs: performance.now() - started,
      server: name,
      stage,
    });
  }
}
function configureServerTools(
  tools: StructuredToolInterface[],
  configuration: McpConfiguration["mcpServers"][string],
  context: SettingsContext,
) {
  overrideMcpToolDescriptions(tools, configuration.toolDescriptionOverrides, context.root, [
    resolve(context.defaultsDirectory, "prompts"),
    ...context.profiles.map(({ directory }) => resolve(directory, "prompts")),
  ]);
  return configureFreeformMcpTools(tools, configuration.freeformToolInputs).parameters;
}
