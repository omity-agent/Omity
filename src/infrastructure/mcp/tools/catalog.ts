import { type BuiltInToolOptions, loadBuiltInTools } from "../../toolbox/loadBuiltIns";
import {
  type McpConfiguration,
  emptyMcpConfiguration,
  readProfileMcpConfiguration,
} from "../configuration";
import { McpLoadError, createMcpLoadError, reportMcpFailure } from "../failures/reportConstruction";
import { type McpToolSnapshot, applyMcpToolSnapshot, emptyMcp } from "./definitions";
import { type SettingsContext, createSettingsContext } from "../../configuration/settings/context";
import { configureFreeformMcpTools, sessionModelTools } from "./freeform";
import { loadServerTools, validateConfiguredServers } from "../loadServers";
import { overrideMcpToolDescriptions, renameMcpTools } from "./descriptions";
import { DomainError } from "../../../errors";
import type { Logger } from "../../logging/logger";
import { McpClientPool } from "../client/pool";
import type { SessionPlaceholders } from "../../configuration/placeholders";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { omit } from "es-toolkit";
import { omitExcludedToolCustomizations } from "../configuration/exclusions";
import { resolve } from "node:path";

export interface LoadedMcp {
  configuration: McpConfiguration;
  close: () => Promise<void>;
  freeformToolParameters: ReadonlyMap<string, string>;
  modelTools: (session: Required<SessionPlaceholders>) => ReturnType<typeof sessionModelTools>;
  tools: StructuredToolInterface[];
}
export interface LoadMcpOptions extends BuiltInToolOptions {
  cwd?: string;
  serverOverrides?: Record<string, boolean>;
}
export function loadMcp(
  root: string,
  logger: Logger,
  context = createSettingsContext(root),
  options: LoadMcpOptions = {},
): Promise<LoadedMcp> {
  return initializeCatalog(logger, context, options);
}
export function loadSessionMcp(
  logger: Logger,
  context: SettingsContext,
  snapshot: McpToolSnapshot,
  options: LoadMcpOptions = {},
) {
  return initializeCatalog(logger, context, options, snapshot);
}
async function initializeCatalog(
  logger: Logger,
  context: SettingsContext,
  options: LoadMcpOptions,
  snapshot?: McpToolSnapshot,
): Promise<LoadedMcp> {
  try {
    const configuration = readProfileMcpConfiguration(
      context,
      snapshot ? snapshot.serverOverrides : options.serverOverrides,
    );
    if (!configuration) {
      logger.info("MCP 配置不存在，跳过工具加载");
      return emptyMcp(emptyMcpConfiguration(), snapshot);
    }
    return await loadMcpConfiguration(configuration, logger, context, options, snapshot);
  } catch (error) {
    if (error instanceof McpLoadError || error instanceof DomainError) {
      throw error;
    }
    throw createMcpLoadError([reportMcpFailure(error, { stage: "configuration" })]);
  }
}
async function loadMcpConfiguration(
  configuration: McpConfiguration,
  logger: Logger,
  context: SettingsContext,
  options: LoadMcpOptions,
  snapshot?: McpToolSnapshot,
) {
  const names = Object.keys(configuration.mcpServers),
    builtInTools = loadBuiltInTools(configuration.toolboxes, options);
  validateConfiguredServers(
    configuration,
    names,
    builtInTools.map((tool) => tool.name),
  );
  if (names.length === 0 && builtInTools.length === 0) {
    logger.info("没有已启用的 MCP 服务器，Agent 将不带工具运行");
    return emptyMcp(configuration, snapshot);
  }
  return connectMcp(
    configuration,
    names,
    context,
    logger,
    builtInTools,
    options.cwd ?? context.root,
    snapshot,
  );
}
async function connectMcp(
  configuration: McpConfiguration,
  names: string[],
  context: SettingsContext,
  logger: Logger,
  builtInTools: StructuredToolInterface[],
  cwd: string,
  snapshot?: McpToolSnapshot,
): Promise<LoadedMcp> {
  const end = logger.child("MCP 工具加载");
  let pool: McpClientPool | undefined;
  try {
    const connections = Object.fromEntries(
        Object.entries(configuration.mcpServers).map(([name, connection]) => [
          name,
          omit(connection, ["defer_loading", "excludedTools", "prefixToolNameWithServerName"]),
        ]),
      ),
      connectedPool = new McpClientPool(connections, configuration.stdio.restart, logger, cwd);
    pool = connectedPool;
    const availableTools = [
        ...builtInTools,
        ...(await loadServerTools(connectedPool, configuration.mcpServers, cwd)),
      ],
      activeConfiguration = omitExcludedToolCustomizations(
        configuration,
        availableTools.map((tool) => tool.name),
      ),
      namedTools = renameMcpTools(availableTools, activeConfiguration.toolNameOverrides),
      configured = snapshot
        ? applyMcpToolSnapshot(namedTools, snapshot)
        : configureCurrentTools(namedTools, activeConfiguration, context),
      { freeformToolParameters, tools } = configured;
    logger.info("已加载 MCP 工具", {
      servers: names,
      tools: tools.map((tool) => tool.name),
    });
    return {
      close: () => connectedPool.close(),
      configuration,
      freeformToolParameters,
      modelTools: snapshot
        ? () => tools
        : (session) => sessionModelTools(tools, freeformToolParameters, session),
      tools,
    };
  } catch (error) {
    const failures = [error];
    try {
      await pool?.close();
    } catch (cleanupError) {
      failures.push(reportMcpFailure(cleanupError, { stage: "cleanup" }));
    }
    throw createMcpLoadError(failures);
  } finally {
    end();
  }
}
function configureCurrentTools(
  tools: StructuredToolInterface[],
  configuration: McpConfiguration,
  context: SettingsContext,
) {
  const described = overrideMcpToolDescriptions(
      tools,
      configuration.toolDescriptionOverrides,
      context.root,
      [
        resolve(context.defaultsDirectory, "prompts"),
        ...context.profiles.map(({ directory }) => resolve(directory, "prompts")),
      ],
    ),
    configured = configureFreeformMcpTools(described, configuration.freeformToolInputs);
  return { freeformToolParameters: configured.parameters, tools: described };
}
