import { configureFreeformMcpTools, sessionModelTools } from "./freeformInputs";
import { overrideMcpToolDescriptions, renameMcpTools } from "./toolOverrides";
import { readLayeredSettingsYaml, userSettingsDirectory } from "../configuration/settingsFiles";
import type { Logger } from "../logging/logger";
import { McpClientPool } from "./client/pool";
import type { SessionPlaceholders } from "../configuration/placeholders";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { collectReadableZodIssues } from "./schemaIssues";
import { createMcpToolFailureClient } from "./toolFailures";
import { disableMcpRequestTimeout } from "./client/timeout";
import { loadMcpTools } from "@langchain/mcp-adapters";
import { parseMcpConfiguration } from "./config";
import { resolve } from "node:path";
import { suppressTerminalError } from "../../failures/output";

export interface LoadedMcp {
  tools: StructuredToolInterface[];
  freeformToolParameters: ReadonlyMap<string, string>;
  modelTools: (session: Required<SessionPlaceholders>) => ReturnType<typeof sessionModelTools>;
  close: () => Promise<void>;
}
export function createMcpLoadError(error: unknown): Error {
  const details = collectReadableZodIssues(error);
  if (details.length === 0) {
    const message = error instanceof Error ? error.message : String(error);
    return suppressTerminalError(new Error(`MCP 工具加载失败：${message}`, { cause: error }));
  }
  return suppressTerminalError(
    new Error(["MCP 配置校验失败：", ...details.map((detail) => `- ${detail}`)].join("\n"), {
      cause: error,
    }),
  );
}
export async function loadMcp(
  root: string,
  logger: Logger,
  userSettingsDir = userSettingsDirectory(),
): Promise<LoadedMcp> {
  const file = readLayeredSettingsYaml(root, "mcp.yaml", {}, userSettingsDir);
  if (!file) {
    logger.info("MCP 配置不存在，跳过工具加载");
    return emptyMcp();
  }
  const configuration = parseMcpConfiguration(file.value, file.path);
  const names = Object.keys(configuration.mcpServers);
  validateConfiguredServers(configuration, names);
  if (names.length === 0) {
    logger.info("MCP 未配置服务器，Agent 将不带工具运行");
    return emptyMcp();
  }
  return connectMcp(configuration, names, root, userSettingsDir, logger);
}
async function connectMcp(
  configuration: ReturnType<typeof parseMcpConfiguration>,
  names: string[],
  root: string,
  userSettingsDir: string,
  logger: Logger,
): Promise<LoadedMcp> {
  const end = logger.child("MCP 工具加载");
  let pool: McpClientPool | undefined;
  try {
    disableMcpRequestTimeout();
    const connectedPool = new McpClientPool(configuration.mcpServers);
    pool = connectedPool;
    const tools = overrideMcpToolDescriptions(
      renameMcpTools(await loadServerTools(connectedPool, names), configuration.toolNameOverrides),
      configuration.toolDescriptionOverrides,
      root,
      [resolve(root, "settings", "prompts"), resolve(userSettingsDir, "prompts")],
    );
    const configured = configureFreeformMcpTools(tools, configuration.freeformToolInputs);
    logger.info("已加载 MCP 工具", {
      servers: names,
      tools: tools.map((tool) => tool.name),
    });
    return {
      close: () => connectedPool.close(),
      freeformToolParameters: configured.parameters,
      modelTools: (session) => sessionModelTools(tools, configured.parameters, session),
      tools,
    };
  } catch (error) {
    await pool?.close();
    throw createMcpLoadError(error);
  } finally {
    end();
  }
}
export async function loadServerTools(
  client: {
    getClient: (name: string) => Promise<object | undefined>;
  },
  names: string[],
) {
  const tools: StructuredToolInterface[] = [];
  for (const name of names) {
    const serverClient = await client.getClient(name);
    if (serverClient === undefined) {
      throw new Error(`MCP 服务器客户端未建立：${name}`);
    }
    tools.push(
      ...(await loadMcpTools(name, createMcpToolFailureClient(serverClient), {
        prefixToolNameWithServerName: true,
        throwOnLoadError: false,
        useStandardContentBlocks: true,
      })),
    );
  }
  return tools;
}
function validateConfiguredServers(
  configuration: ReturnType<typeof parseMcpConfiguration>,
  names: string[],
) {
  if (names.length > 0) {
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
function emptyMcp(): LoadedMcp {
  return {
    close: () => Promise.resolve(),
    freeformToolParameters: new Map(),
    modelTools: () => [],
    tools: [],
  };
}
