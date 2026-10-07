import { mcpServerSchema, normalizeMcpServers } from "./connections";
import { builtInPreferencesSchema } from "../../toolbox/metadata";
import { emptyAs } from "../../configuration/settings/values";
import { localize } from "../../../i18n/server";
import { z } from "zod";

const nonEmpty = z.string().min(1),
  toolName = nonEmpty.refine((name) => name !== "agent", {
    error: localize("mcp:configuration.agentNameForbidden"),
  });
export const toolboxSchema = z.strictObject({
  mcpServers: emptyAs(z.record(z.string(), mcpServerSchema), {}).transform(normalizeMcpServers),
  stdio: z.strictObject({
    restart: z.strictObject({
      delayMs: z.number().int().nonnegative().max(60_000),
      maxAttempts: z.number().int().positive().max(100),
    }),
  }),
  toolNameOverrides: emptyAs(z.record(z.string(), toolName), {}),
  toolboxes: emptyAs(builtInPreferencesSchema, {}),
});
