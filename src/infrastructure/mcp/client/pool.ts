import { type McpOperations, connectProtocolClient } from "./protocol";
import { AsyncResourceCache } from "../lifecycle";
import { HandshakeEvidence } from "./handshakeEvidence";
import type { Logger } from "../../logging/logger";
import { RestartingStdioClient } from "./restarting";
import type { StdioRestartPolicy } from "./availability";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { mcpHttpReconnection } from "../../../../settings/networking";
import { parseMcpConnection } from "../configuration/connections";
import { reportMcpFailure } from "../failures/reportConstruction";

export class McpClientPool {
  private readonly resources = new AsyncResourceCache<{
    client: McpOperations;
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
    let connection;
    try {
      connection = parseMcpConnection(this.connections[name]);
    } catch (error) {
      throw reportMcpFailure(error, { server: name, stage: "configuration" });
    }
    if (connection.kind === "stdio") {
      const client = await RestartingStdioClient.create(
        name,
        { ...connection.options, cwd: connection.options.cwd ?? this.cwd },
        this.restartPolicy,
        this.logger,
      );
      return { client, close: () => client.close() };
    }
    const evidence = new HandshakeEvidence(),
      transport = new StreamableHTTPClientTransport(new URL(connection.options.url), {
        fetch: (input, init) => globalThis.fetch(input, init),
        reconnectionOptions: mcpHttpReconnection,
        requestInit: { headers: connection.options.headers },
      });
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- MCP transport 不是 EventTarget。
    transport.onerror = (error) => {
      evidence.record(error);
    };
    try {
      const client = await connectProtocolClient(transport);
      return { client, close: () => client.close() };
    } catch (error) {
      throw reportMcpFailure(error, {
        ...evidence.snapshot(),
        connection,
        server: name,
        stage: "initialize",
      });
    } finally {
      evidence.stop();
    }
  }
}
