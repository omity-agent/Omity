import { type BuiltInToolOptions, loadBuiltInTools } from "../../toolbox/loadBuiltIns";
import {
  type McpConfiguration,
  emptyMcpConfiguration,
  readProfileMcpConfiguration,
} from "../configuration";
import { type McpToolSnapshot, applyMcpToolSnapshot, emptyMcp } from "./definitions";
import { type SettingsContext, createSettingsContext } from "../../configuration/settings/context";
import { configureFreeformMcpTools, sessionModelTools } from "./freeform";
import { loadServerTools, validateConfiguredServers } from "../loadServers";
import { overrideMcpToolDescriptions, renameMcpTools } from "./descriptions";
import type { Logger } from "../../logging/logger";
import { McpClientPool } from "../client/pool";
import type { SessionPlaceholders } from "../../configuration/placeholders";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { collectReadableZodIssues } from "./issues";
import { disableAdapterRequestTimeout } from "../client/timeout";
import { resolve } from "node:path";
import { suppressTerminalError } from "../../../failures/output";

export { loadServerTools } from "../loadServers";
export interface LoadedMcp {
  configuration: McpConfiguration;
  close: () => Promise<void>;
  freeformToolParameters: ReadonlyMap<string, string>;
  modelTools: (session: Required<SessionPlaceholders>) => ReturnType<typeof sessionModelTools>;
  tools: StructuredToolInterface[];
}
export interface LoadMcpOptions extends BuiltInToolOptions {
  cwd?: string;
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
  context = createSettingsContext(root),
  options: LoadMcpOptions = {},
): Promise<LoadedMcp> {
  const configuration = readProfileMcpConfiguration(context);
  if (!configuration) {
    logger.info("MCP 配置不存在，跳过工具加载");
    return emptyMcp(emptyMcpConfiguration());
  }
  return loadMcpConfiguration(configuration, logger, context, options);
}
export async function loadSessionMcp(
  logger: Logger,
  context: SettingsContext,
  snapshot: McpToolSnapshot,
  options: LoadMcpOptions = {},
) {
  const configuration = readProfileMcpConfiguration(context);
  if (!configuration) {
    logger.info("MCP 配置不存在，跳过工具加载");
    return emptyMcp(emptyMcpConfiguration(), snapshot);
  }
  return loadMcpConfiguration(configuration, logger, context, options, snapshot);
}
async function loadMcpConfiguration(
  configuration: McpConfiguration,
  logger: Logger,
  context: SettingsContext,
  options: LoadMcpOptions,
  snapshot?: McpToolSnapshot,
) {
  const names = Object.keys(configuration.mcpServers),
    builtInTools = loadBuiltInTools(configuration.toolboxes.ask_user.enabled, options);
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
    disableAdapterRequestTimeout();
    const connectedPool = new McpClientPool(
      configuration.mcpServers,
      configuration.stdio.restart,
      logger,
      cwd,
    );
    pool = connectedPool;
    const namedTools = renameMcpTools(
        [...builtInTools, ...(await loadServerTools(connectedPool, names))],
        configuration.toolNameOverrides,
      ),
      configured = snapshot
        ? applyMcpToolSnapshot(namedTools, snapshot)
        : configureCurrentTools(namedTools, configuration, context),
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
    await pool?.close();
    throw createMcpLoadError(error);
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
