import { AsyncResourceCache, cleanupFailedInitialization } from "../lifecycle";
import { type Connection, MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { Logger } from "../../logging/logger";
import { RestartingStdioClient } from "./restarting";
import type { StdioRestartPolicy } from "./availability";
import { isPlainObject as isRecord } from "es-toolkit";
import { isStdioConnection } from "./stdio";

interface McpClient {
  listTools: (...args: never[]) => unknown;
}
export class McpClientPool {
  private readonly resources = new AsyncResourceCache<{
    client: McpClient;
    close: () => Promise<void>;
  }>("MCP 连接池");
  constructor(
    private readonly connections: Record<string, unknown>,
    private readonly restartPolicy: StdioRestartPolicy,
    private readonly logger: Logger,
    private readonly cwd: string,
  ) {}
  async getClient(name: string) {
    const resource = await this.resources.load(name, () => this.connect(name));
    return resource.client;
  }
  close() {
    return this.resources.close();
  }
  private async connect(name: string) {
    const connection = this.connections[name];
    if (isStdioConnection(connection)) {
      const client = await RestartingStdioClient.create(
        name,
        { cwd: this.cwd, ...connection },
        this.restartPolicy,
        this.logger,
      );
      return { client, close: () => client.close() };
    }
    if (!isHttpConnection(connection)) {
      throw new Error(`MCP 服务器配置无法识别：${name}`);
    }
    const owner = new MultiServerMCPClient({
      mcpServers: { [name]: connection },
      prefixToolNameWithServerName: true,
      throwOnLoadError: false,
    });
    try {
      const client = await owner.getClient(name);
      if (!client) {
        throw new Error(`MCP 服务器客户端未建立：${name}`);
      }
      return { client, close: () => owner.close() };
    } catch (error) {
      return cleanupFailedInitialization(error, () => owner.close());
    }
  }
}
function isHttpConnection(value: unknown): value is Connection {
  return isRecord(value) && !("command" in value) && typeof value["url"] === "string";
}
