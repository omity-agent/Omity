import { DomainError } from "../../../errors";
import { emptyAs } from "../../configuration/settings/values";
import { isPlainObject as isRecord } from "es-toolkit";
import { localize } from "../../../i18n/server";
import { mcpServerSchema } from "./connections";
import { z } from "zod";

const serverPreferencesSchema = z.object({
  mcpServers: emptyAs(z.record(z.string().min(1), mcpServerSchema.pick({ enabled: true })), {}),
});
export function describeMcpServers(value: unknown) {
  const { mcpServers } = serverPreferencesSchema.parse(value);
  return Object.entries(mcpServers).map(([id, server]) => ({
    enable: server.enabled ?? true,
    id,
  }));
}
export function applyServerOverrides(
  value: unknown,
  overrides: Record<string, boolean> = {},
): unknown {
  if (Object.keys(overrides).length === 0) {
    return value;
  }
  const servers = isRecord(value) && isRecord(value["mcpServers"]) ? value["mcpServers"] : {};
  for (const name of Object.keys(overrides)) {
    if (!Object.hasOwn(servers, name)) {
      throw new DomainError(
        "MCP_SELECTION_INVALID",
        localize("mcp:configuration.serverMissing", {
          value0: name,
        }),
      );
    }
  }
  return {
    ...z.record(z.string(), z.unknown()).parse(value),
    mcpServers: Object.fromEntries(
      Object.entries(servers).map(([name, server]) => [
        name,
        Object.hasOwn(overrides, name)
          ? { ...z.record(z.string(), z.unknown()).parse(server), enabled: overrides[name] }
          : server,
      ]),
    ),
  };
}
