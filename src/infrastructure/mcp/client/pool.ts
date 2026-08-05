import { type Connection, MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { Logger } from "../../logging/logger";
import { RestartingStdioClient } from "./restarting";
import type { StdioRestartPolicy } from "./availability";
import { isStdioConnection } from "./stdio";

export class McpClientPool {
  private readonly http?: MultiServerMCPClient;
  private readonly stdio = new Map<string, Promise<RestartingStdioClient>>();
  constructor(
    private readonly connections: Record<string, unknown>,
    private readonly restartPolicy: StdioRestartPolicy,
    private readonly logger: Logger,
  ) {
    const httpConnections = Object.fromEntries(
      Object.entries(connections).filter(([, connection]) => !isStdioConnection(connection)),
    );
    if (Object.keys(httpConnections).length > 0) {
      this.http = new MultiServerMCPClient({
        mcpServers: collectMcpConnections(httpConnections),
        prefixToolNameWithServerName: true,
        throwOnLoadError: false,
      });
    }
  }
  async getClient(name: string) {
    const connection = this.connections[name];
    if (!isStdioConnection(connection)) {
      return this.http?.getClient(name);
    }
    const loading = this.stdio.get(name);
    if (loading) {
      return loading;
    }
    const client = RestartingStdioClient.create(name, connection, this.restartPolicy, this.logger);
    this.stdio.set(name, client);
    try {
      return await client;
    } catch (error) {
      if (this.stdio.get(name) === client) {
        this.stdio.delete(name);
      }
      throw error;
    }
  }
  async close() {
    await Promise.all([
      this.http?.close(),
      ...[...this.stdio.values()].map(async (loading) => {
        const client = await loading;
        await client.close();
      }),
    ]);
    this.stdio.clear();
  }
}
function collectMcpConnections(mcpServers: Record<string, unknown>) {
  const connections: Record<string, Connection> = {};
  for (const [name, server] of Object.entries(mcpServers)) {
    if (!isMcpConnection(server)) {
      throw new Error(`MCP 服务器配置无法识别：${name}`);
    }
    connections[name] = server;
  }
  return connections;
}
function isMcpConnection(value: unknown): value is Connection {
  if (!isRecord(value)) {
    return false;
  }
  if ("command" in value) {
    return isStdioConnection(value);
  }
  return typeof value["url"] === "string";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
