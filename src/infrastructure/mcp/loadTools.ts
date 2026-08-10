import { type BuiltInToolOptions, loadBuiltInTools } from "../toolbox/loadBuiltIns";
import { type SettingsContext, createSettingsContext } from "../configuration/settings/context";
import { configureFreeformMcpTools, sessionModelTools } from "./freeformInputs";
import { overrideMcpToolDescriptions, renameMcpTools } from "./toolOverrides";
import type { Logger } from "../logging/logger";
import { McpClientPool } from "./client/pool";
import type { SessionPlaceholders } from "../configuration/placeholders";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { collectReadableZodIssues } from "./schemaIssues";
import { createMcpToolFailureClient } from "./toolFailures";
import { disableAdapterRequestTimeout } from "./client/timeout";
import { loadMcpTools } from "@langchain/mcp-adapters";
import { omitDisabledToolboxConfiguration } from "./activation";
import { parseMcpConfiguration } from "./config";
import { readLayeredSettingsYaml } from "../configuration/settings/files";
import { resolve } from "node:path";
import { resolveConfiguredPath } from "../configuration/configuredPath";
import { suppressTerminalError } from "../../failures/output";

export interface LoadedMcp {
  tools: StructuredToolInterface[];
  freeformToolParameters: ReadonlyMap<string, string>;
  modelTools: (session: Required<SessionPlaceholders>) => ReturnType<typeof sessionModelTools>;
  close: () => Promise<void>;
}
export type LoadMcpOptions = BuiltInToolOptions;
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
  context = createSettingsContext(root),
  options: LoadMcpOptions = {},
): Promise<LoadedMcp> {
  const file = readLayeredSettingsYaml(
    context,
    "profile",
    "toolbox.yaml",
    {},
    {
      beforePlaceholders: omitDisabledToolboxConfiguration,
      override: resolveProfilePaths,
    },
  );
  if (!file) {
    logger.info("MCP 配置不存在，跳过工具加载");
    return emptyMcp();
  }
  const configuration = parseMcpConfiguration(file.value, file.path);
  const names = Object.keys(configuration.mcpServers);
  const builtInTools = loadBuiltInTools(configuration.toolboxes.ask_user.enabled, options);
  validateConfiguredServers(
    configuration,
    names,
    builtInTools.map((tool) => tool.name),
  );
  if (names.length === 0 && builtInTools.length === 0) {
    logger.info("没有已启用的 MCP 服务器，Agent 将不带工具运行");
    return emptyMcp();
  }
  return connectMcp(configuration, names, context, logger, builtInTools);
}
async function connectMcp(
  configuration: ReturnType<typeof parseMcpConfiguration>,
  names: string[],
  context: SettingsContext,
  logger: Logger,
  builtInTools: StructuredToolInterface[],
): Promise<LoadedMcp> {
  const end = logger.child("MCP 工具加载");
  let pool: McpClientPool | undefined;
  try {
    disableAdapterRequestTimeout();
    const connectedPool = new McpClientPool(
      configuration.mcpServers,
      configuration.stdio.restart,
      logger,
    );
    pool = connectedPool;
    const tools = overrideMcpToolDescriptions(
      renameMcpTools(
        [...builtInTools, ...(await loadServerTools(connectedPool, names))],
        configuration.toolNameOverrides,
      ),
      configuration.toolDescriptionOverrides,
      context.root,
      [
        resolve(context.defaultsDirectory, "prompts"),
        ...context.profiles.map(({ directory }) => resolve(directory, "prompts")),
      ],
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
function resolveProfilePaths(value: unknown, override: unknown, directory: string): unknown {
  if (
    !isRecord(value) ||
    !isRecord(value["toolDescriptionOverrides"]) ||
    !isRecord(override) ||
    !isRecord(override["toolDescriptionOverrides"])
  ) {
    return value;
  }
  const paths = { ...value["toolDescriptionOverrides"] };
  for (const name of Object.keys(override["toolDescriptionOverrides"])) {
    const path = paths[name];
    if (typeof path === "string") {
      paths[name] = resolveConfiguredPath(directory, path);
    }
  }
  return {
    ...value,
    toolDescriptionOverrides: paths,
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
function emptyMcp(): LoadedMcp {
  return {
    close: () => Promise.resolve(),
    freeformToolParameters: new Map(),
    modelTools: () => [],
    tools: [],
  };
}
