import { type BuiltInToolOptions, loadBuiltInTools } from "../toolbox/loadBuiltIns";
import { type McpConfiguration, parseMcpConfiguration } from "./config";
import { type McpSnapshot, applyMcpSnapshot, emptyMcp, emptyMcpSnapshot } from "./snapshot";
import { type SettingsContext, createSettingsContext } from "../configuration/settings/context";
import { configureFreeformMcpTools, sessionModelTools } from "./freeformInputs";
import { loadServerTools, validateConfiguredServers } from "./loadServers";
import { overrideMcpToolDescriptions, renameMcpTools } from "./toolOverrides";
import type { Logger } from "../logging/logger";
import { McpClientPool } from "./client/pool";
import type { SessionPlaceholders } from "../configuration/placeholders";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { collectReadableZodIssues } from "./schemaIssues";
import { disableAdapterRequestTimeout } from "./client/timeout";
import { omitDisabledToolboxConfiguration } from "./activation";
import { readLayeredSettingsYaml } from "../configuration/settings/files";
import { resolve } from "node:path";
import { resolveConfiguredPath } from "../configuration/configuredPath";
import { suppressTerminalError } from "../../failures/output";

export { loadServerTools } from "./loadServers";
export interface LoadedMcp {
  configuration: McpConfiguration;
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
    return emptyMcp(emptyMcpSnapshot().configuration);
  }
  const configuration = parseMcpConfiguration(file.value, file.path),
    names = Object.keys(configuration.mcpServers),
    builtInTools = loadBuiltInTools(configuration.toolboxes.ask_user.enabled, options);
  validateConfiguredServers(
    configuration,
    names,
    builtInTools.map((tool) => tool.name),
  );
  if (names.length === 0 && builtInTools.length === 0) {
    logger.info("没有已启用的 MCP 服务器，Agent 将不带工具运行");
    return emptyMcp(configuration);
  }
  return connectMcp(configuration, names, context, logger, builtInTools);
}
export async function loadMcpSnapshot(
  logger: Logger,
  snapshot: McpSnapshot,
  options: LoadMcpOptions = {},
) {
  const { configuration } = snapshot,
    names = Object.keys(configuration.mcpServers),
    builtInTools = loadBuiltInTools(configuration.toolboxes.ask_user.enabled, options);
  validateConfiguredServers(
    configuration,
    names,
    builtInTools.map((tool) => tool.name),
  );
  if (names.length === 0 && builtInTools.length === 0) {
    return emptyMcp(configuration, snapshot);
  }
  return connectMcp(configuration, names, undefined, logger, builtInTools, snapshot);
}
async function connectMcp(
  configuration: McpConfiguration,
  names: string[],
  context: SettingsContext | undefined,
  logger: Logger,
  builtInTools: StructuredToolInterface[],
  snapshot?: McpSnapshot,
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
    const namedTools = renameMcpTools(
        [...builtInTools, ...(await loadServerTools(connectedPool, names))],
        configuration.toolNameOverrides,
      ),
      configured = snapshot
        ? applyMcpSnapshot(namedTools, snapshot)
        : configureCurrentTools(namedTools, configuration, requireSettingsContext(context)),
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
function requireSettingsContext(context: SettingsContext | undefined) {
  if (!context) {
    throw new Error("MCP 配置加载缺少 Settings Context");
  }
  return context;
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
