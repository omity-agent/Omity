import { isPlainObject as isRecord } from "es-toolkit";

export function enableConfiguredMcpServers(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value["mcpServers"])) {
    return value;
  }
  return {
    ...value,
    mcpServers: Object.fromEntries(
      Object.entries(value["mcpServers"]).map(([name, server]) => [
        name,
        isRecord(server) ? { ...server, enabled: true } : server,
      ]),
    ),
  };
}
export function omitDisabledToolboxConfiguration(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value["mcpServers"])) {
    return value;
  }
  return {
    ...value,
    mcpServers: Object.fromEntries(
      Object.entries(value["mcpServers"]).filter(
        ([, server]) => !isRecord(server) || server["enabled"] !== false,
      ),
    ),
  };
}
