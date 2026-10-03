import { mcpServerSchema, normalizeMcpServers } from "./connections";
import { builtInPreferencesSchema } from "../../toolbox/metadata";
import { emptyAs } from "../../configuration/settings/values";
import { z } from "zod";

const nonEmpty = z.string().min(1),
  toolName = nonEmpty.refine((name) => name !== "agent", {
    error: "MCP 工具不能命名为 agent",
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
