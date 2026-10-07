import { type BuiltInToolOptions, loadBuiltInTools } from "../../toolbox/loadBuiltIns";
import {
  type McpConfiguration,
  emptyMcpConfiguration,
  readProfileMcpConfiguration,
  readSessionMcpConfiguration,
} from "../configuration";
import { McpLoadError, createMcpLoadError, reportMcpFailure } from "../failures/reportConstruction";
import { type McpToolSnapshot, applyMcpToolSnapshot, emptyMcp } from "./definitions";
import { type SettingsContext, createSettingsContext } from "../../configuration/settings/context";
import { DomainError } from "../../../errors";
import type { Logger } from "../../logging/logger";
import { McpClientPool } from "../client/pool";
import type { SessionPlaceholders } from "../../configuration/placeholders";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { loadServerTools } from "../loadServers";
import { localize } from "../../../i18n/server";
import { omit } from "es-toolkit";
import { renameMcpTools } from "./descriptions";
import { sessionModelTools } from "./freeform";

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
    const configuration = snapshot
      ? readSessionMcpConfiguration(context, snapshot)
      : readProfileMcpConfiguration(context, options.serverOverrides);
    if (!configuration) {
      logger.info(localize("mcp:catalog.configurationMissing"));
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
  if (names.length === 0 && builtInTools.length === 0) {
    logger.info(localize("mcp:catalog.noEnabledServers"));
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
  const end = logger.child(localize("mcp:catalog.loadingTools"));
  let pool: McpClientPool | undefined;
  try {
    const connections = Object.fromEntries(
        Object.entries(configuration.mcpServers).map(([name, connection]) => [
          name,
          omit(connection, [
            "defer_loading",
            "excludedTools",
            "freeformToolInputs",
            "prefixToolNameWithServerName",
            "toolDescriptionOverrides",
          ]),
        ]),
      ),
      connectedPool = new McpClientPool(connections, configuration.stdio.restart, logger, cwd);
    pool = connectedPool;
    const catalog = await loadServerTools(connectedPool, configuration.mcpServers, {
        context,
        customize: snapshot === undefined,
        cwd,
      }),
      availableTools = [...builtInTools, ...catalog.tools],
      namedTools = renameMcpTools(availableTools, configuration.toolNameOverrides),
      configured = snapshot
        ? applyMcpToolSnapshot(namedTools, snapshot)
        : {
            freeformToolParameters: new Map(
              [...catalog.freeformToolParameters].map(([tool, parameter]) => [
                configuration.toolNameOverrides[tool] ?? tool,
                parameter,
              ]),
            ),
            tools: namedTools,
          },
      { freeformToolParameters, tools } = configured;
    logger.info(localize("mcp:catalog.toolsLoaded"), {
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
