import {
  type McpConnection,
  type McpFailure,
  type McpLoadDetails,
  mcpLoadDetailsSchema,
} from "./wireFormat";
import { collectReadableZodIssues } from "../tools/issues";
import { createSecretFilter } from "./secretFilter";
import { localize } from "../../../i18n/server";
import { suppressTerminalError } from "../../../failures/output";
import { uniq } from "es-toolkit";

interface FailureContext extends Omit<McpFailure, "connection" | "error" | "transportErrors"> {
  connection?: McpConnection;
  cwd?: string;
  transportErrors?: unknown[];
}
class McpFailureError extends Error {
  override readonly name = "McpFailureError";
  constructor(readonly failure: McpFailure) {
    super(
      failure.server
        ? localize("mcp:connection.serverFailed", { server: failure.server })
        : localize("mcp:connection.loadFailed"),
    );
  }
}
export class McpLoadError extends Error {
  readonly code = "MCP_LOAD_FAILED";
  override readonly name = "McpLoadError";
  readonly details: McpLoadDetails;
  constructor(failures: McpFailure[]) {
    const details = mcpLoadDetailsSchema.parse({ failures }),
      servers = uniq(details.failures.flatMap(({ server }) => (server ? [server] : [])));
    super(
      servers.length > 0
        ? localize("mcp:connection.startupFailed", {
            servers: servers.map((server) => JSON.stringify(server)).join(", "),
          })
        : failures.every(({ stage }) => stage === "configuration")
          ? localize("mcp:connection.configurationFailed")
          : localize("mcp:connection.loadFailed"),
    );
    this.details = details;
  }
}
export function reportMcpFailure(error: unknown, context: FailureContext) {
  if (error instanceof McpFailureError) {
    return error;
  }
  const { connection, cwd, transportErrors, ...details } = context,
    filter = createSecretFilter(connection),
    issues = collectReadableZodIssues(error),
    target =
      connection?.kind === "stdio"
        ? {
            args: connection.options.args.map(filter.text),
            command: filter.text(connection.options.command),
            cwd: filter.text(connection.options.cwd ?? cwd ?? process.cwd()),
            environmentKeys: Object.keys(connection.options.env ?? {}).toSorted(),
            transport: "stdio" as const,
          }
        : connection?.kind === "http"
          ? {
              headerNames: Object.keys(connection.options.headers ?? {}).toSorted(),
              transport: "http" as const,
              url: filter.text(connection.options.url),
            }
          : undefined;
  return new McpFailureError({
    ...details,
    error: filter.error(error),
    ...(target ? { connection: target } : {}),
    ...(issues.length > 0 ? { issues: issues.map(filter.text) } : {}),
    ...(details.stderr
      ? { stderr: { ...details.stderr, text: filter.text(details.stderr.text) } }
      : {}),
    ...(details.stdout
      ? { stdout: { ...details.stdout, text: filter.text(details.stdout.text) } }
      : {}),
    ...(transportErrors?.length
      ? { transportErrors: transportErrors.map((failure) => filter.error(failure)) }
      : {}),
  });
}
export function createMcpLoadError(errors: unknown[]) {
  return suppressTerminalError(new McpLoadError(errors.flatMap(collectFailures)));
}
function collectFailures(error: unknown): McpFailure[] {
  if (error instanceof McpLoadError) {
    return error.details.failures;
  }
  if (error instanceof McpFailureError) {
    return [error.failure];
  }
  if (error instanceof AggregateError) {
    return error.errors.flatMap((failure: unknown) => collectFailures(failure));
  }
  return [
    reportMcpFailure(error, {
      stage: collectReadableZodIssues(error).length > 0 ? "configuration" : "customization",
    }).failure,
  ];
}
