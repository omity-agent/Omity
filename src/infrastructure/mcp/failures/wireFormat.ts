import { errorDetailsSchema } from "../../../failures/details";
import type { parseMcpConnection } from "../configuration/connections";
import { z } from "zod";

const connectionDiagnosticSchema = z.discriminatedUnion("transport", [
    z.strictObject({
      args: z.array(z.string()),
      command: z.string(),
      cwd: z.string(),
      environmentKeys: z.array(z.string()),
      transport: z.literal("stdio"),
    }),
    z.strictObject({
      headerNames: z.array(z.string()),
      transport: z.literal("http"),
      url: z.string(),
    }),
  ]),
  processDiagnosticSchema = z.strictObject({
    closedByClient: z.boolean(),
    exitCode: z.number().int().nullable(),
    exited: z.boolean(),
    pid: z.number().int().nullable(),
    signal: z.string().nullable(),
  }),
  outputDiagnosticSchema = z.strictObject({
    capturedBytes: z.number().int().nonnegative(),
    discardedBytes: z.number().int().nonnegative(),
    text: z.string(),
  });
const mcpFailureSchema = z.strictObject({
  connection: connectionDiagnosticSchema.optional(),
  durationMs: z.number().nonnegative().optional(),
  error: errorDetailsSchema,
  issues: z.array(z.string()).optional(),
  process: processDiagnosticSchema.optional(),
  server: z.string().optional(),
  stage: z.enum(["configuration", "spawn", "initialize", "list_tools", "customization", "cleanup"]),
  stderr: outputDiagnosticSchema.optional(),
  stdout: outputDiagnosticSchema.optional(),
  transportErrors: z.array(errorDetailsSchema).optional(),
  transportErrorsDiscarded: z.number().int().nonnegative().optional(),
});
export const mcpLoadDetailsSchema = z.strictObject({
  failures: z.array(mcpFailureSchema).min(1),
});
export type McpFailure = z.output<typeof mcpFailureSchema>;
export type McpLoadDetails = z.output<typeof mcpLoadDetailsSchema>;
export type McpConnection = ReturnType<typeof parseMcpConnection>;
