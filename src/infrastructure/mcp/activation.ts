export function omitDisabledToolboxConfiguration(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const servers = isRecord(value["mcpServers"]) ? value["mcpServers"] : {},
    disabledServers = new Set(
      Object.entries(servers)
        .filter(([, server]) => isRecord(server) && server["enabled"] === false)
        .map(([name]) => name),
    ),
    disabledToolboxTools = disabledToolboxToolNames(value);
  if (disabledServers.size === 0 && disabledToolboxTools.size === 0) {
    return value;
  }
  const serverNames = Object.keys(servers).toSorted((left, right) => right.length - left.length),
    serverAliases = collectServerAliases(value["toolNameOverrides"], serverNames, disabledServers),
    toolboxAliases = collectToolboxAliases(value["toolNameOverrides"], disabledToolboxTools);
  return {
    ...value,
    freeformToolInputs: filterArray(
      value["freeformToolInputs"],
      (name) =>
        isEnabledServerToolName(name, serverNames, disabledServers, serverAliases) &&
        !toolboxAliases.has(name),
    ),
    ...(isRecord(value["mcpServers"])
      ? { mcpServers: filterRecord(servers, (name) => !disabledServers.has(name)) }
      : {}),
    toolDescriptionOverrides: filterRecord(
      value["toolDescriptionOverrides"],
      (name) =>
        isEnabledServerToolName(name, serverNames, disabledServers, serverAliases) &&
        !toolboxAliases.has(name),
    ),
    toolNameOverrides: filterRecord(
      value["toolNameOverrides"],
      (name) =>
        !belongsToDisabledServer(name, serverNames, disabledServers) &&
        !disabledToolboxTools.has(name),
    ),
  };
}
function disabledToolboxToolNames(value: Record<string, unknown>) {
  const { toolboxes } = value,
    askUser = isRecord(toolboxes) ? toolboxes["ask_user"] : undefined;
  return isRecord(askUser) && askUser["enabled"] === false
    ? new Set(["ask_user__choice", "ask_user__open_ended"])
    : new Set<string>();
}
function collectToolboxAliases(value: unknown, disabled: Set<string>) {
  const aliases = new Set(disabled);
  if (!isRecord(value)) {
    return aliases;
  }
  for (const [name, target] of Object.entries(value)) {
    if (disabled.has(name) && typeof target === "string") {
      aliases.add(target);
    }
  }
  return aliases;
}
function belongsToDisabledServer(name: string, serverNames: string[], disabled: Set<string>) {
  const server = serverNames.find((candidate) => name.startsWith(`${candidate}__`));
  return server !== undefined && disabled.has(server);
}
function collectServerAliases(value: unknown, serverNames: string[], disabled: Set<string>) {
  const aliases = {
    disabled: new Set<string>(),
    enabled: new Set<string>(),
  };
  if (!isRecord(value)) {
    return aliases;
  }
  for (const [name, target] of Object.entries(value)) {
    if (typeof target === "string") {
      const state = belongsToDisabledServer(name, serverNames, disabled) ? "disabled" : "enabled";
      aliases[state].add(target);
    }
  }
  return aliases;
}
function filterArray(value: unknown, keep: (name: string) => boolean) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item !== "string" || keep(item))
    : value;
}
function filterRecord(value: unknown, keep: (name: string, entry: unknown) => boolean): unknown {
  return isRecord(value)
    ? Object.fromEntries(Object.entries(value).filter(([name, entry]) => keep(name, entry)))
    : value;
}
function isEnabledServerToolName(
  name: string,
  serverNames: string[],
  disabled: Set<string>,
  aliases: ReturnType<typeof collectServerAliases>,
) {
  return (
    aliases.enabled.has(name) ||
    (!aliases.disabled.has(name) && !belongsToDisabledServer(name, serverNames, disabled))
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
