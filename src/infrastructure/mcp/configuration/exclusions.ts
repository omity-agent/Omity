import type { McpConfiguration } from "./index";

export function excludedServerToolNames(
  server: string,
  configuration: McpConfiguration["mcpServers"][string],
) {
  return (configuration.excludedTools ?? []).map((name) =>
    configuration.prefixToolNameWithServerName === false ? name : `${server}__${name}`,
  );
}
export function omitExcludedToolCustomizations(
  configuration: McpConfiguration,
  availableNames: string[],
): McpConfiguration {
  const available = new Set(availableNames),
    excludedSources = new Set(
      Object.entries(configuration.mcpServers)
        .flatMap(([server, preferences]) => excludedServerToolNames(server, preferences))
        .filter((name) => !available.has(name)),
    ),
    overrides = new Map(Object.entries(configuration.toolNameOverrides)),
    excludedTargets = new Set(
      [...excludedSources].flatMap((name) => [name, overrides.get(name) ?? name]),
    ),
    availableTargets = new Set(availableNames.map((name) => overrides.get(name) ?? name)),
    keepTarget = (name: string) => availableTargets.has(name) || !excludedTargets.has(name);
  return {
    ...configuration,
    freeformToolInputs: configuration.freeformToolInputs.filter(keepTarget),
    toolDescriptionOverrides: Object.fromEntries(
      Object.entries(configuration.toolDescriptionOverrides).filter(([name]) => keepTarget(name)),
    ),
    toolNameOverrides: Object.fromEntries(
      Object.entries(configuration.toolNameOverrides).filter(
        ([name]) => !excludedSources.has(name),
      ),
    ),
  };
}
