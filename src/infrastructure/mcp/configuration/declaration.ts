import { builtInPreferencesSchema } from "../../toolbox/metadata";
import { normalizeMcpServers } from "./connections";
import { z } from "zod";

const nonEmpty = z.string().min(1),
  names = z.array(nonEmpty).refine((values) => new Set(values).size === values.length, {
    error: "MCP free-form 工具配置包含重复工具",
  }),
  toolName = nonEmpty.refine((name) => name !== "agent", {
    error: "MCP 工具不能命名为 agent",
  });
export const toolboxSchema = z.strictObject({
  freeformToolInputs: names.nullish().transform((value) => value ?? []),
  mcpServers: z.record(z.string(), z.unknown()).default({}).transform(normalizeMcpServers),
  stdio: z
    .strictObject({
      restart: z.strictObject({
        delayMs: z.number().int().nonnegative().max(60_000),
        maxAttempts: z.number().int().positive().max(100),
      }),
    })
    .default({ restart: { delayMs: 1000, maxAttempts: 3 } }),
  toolDescriptionOverrides: z
    .record(z.string(), nonEmpty)
    .nullish()
    .transform((value) => value ?? {}),
  toolNameOverrides: z
    .record(z.string(), toolName)
    .nullish()
    .transform((value) => value ?? {}),
  toolboxes: builtInPreferencesSchema.default({}),
});
