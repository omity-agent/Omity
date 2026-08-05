import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { StdioConnection } from "@langchain/mcp-adapters";
import { Writable } from "node:stream";

const maximumStderrBytes = 64 * 1024;
export interface ConnectedStdioClient {
  client: Client;
  close: () => Promise<void>;
  closed: Promise<void>;
  diagnostics: () => string;
  isClosed: () => boolean;
}
export type StdioConnector = (
  serverName: string,
  connection: StdioConnection,
  signal?: AbortSignal,
) => Promise<ConnectedStdioClient>;
export const connectStdioClient: StdioConnector = async (serverName, connection, signal) => {
  const transport = new StdioClientTransport({
    args: connection.args,
    command: connection.command,
    cwd: connection.cwd,
    env: connection.env,
    stderr: "pipe",
  });
  const { stderr } = transport;
  if (stderr === null) {
    throw new Error(`MCP 服务器 ${serverName} 无法捕获 stderr`);
  }
  const diagnostics = new BoundedBytes(maximumStderrBytes);
  stderr.pipe(
    new Writable({
      write(chunk: unknown, _encoding, done) {
        diagnostics.append(chunk);
        done();
      },
    }),
  );
  const closed = Promise.withResolvers<void>();
  let isClosed = false;
  const closeTransport = () => {
    isClosed = true;
    closed.resolve();
  };
  const client = new Client({ name: "omity-agent", version: "1.0.0" });
  Reflect.set(client, "onclose", closeTransport);
  try {
    await client.connect(transport, signal ? { signal } : undefined);
    return {
      client,
      close: async () => {
        await client.close();
        isClosed = true;
        closed.resolve();
      },
      closed: closed.promise,
      diagnostics: () => diagnostics.text(),
      isClosed: () => isClosed,
    };
  } catch (error) {
    await client.close();
    const output = diagnostics.text();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      output
        ? `MCP stdio 服务器 "${serverName}" 连接失败：${message}\n\n子进程 stderr：\n${output}`
        : `MCP stdio 服务器 "${serverName}" 连接失败：${message}`,
      { cause: error },
    );
  }
};
export function isStdioConnection(value: unknown): value is StdioConnection {
  return (
    isRecord(value) &&
    typeof value["command"] === "string" &&
    Array.isArray(value["args"]) &&
    value["args"].every((argument) => typeof argument === "string")
  );
}
class BoundedBytes {
  private bytes = Buffer.alloc(0);
  private truncated = false;
  constructor(private readonly maximum: number) {}
  append(value: unknown) {
    const incoming = toBuffer(value);
    const combined = Buffer.concat([this.bytes, incoming]);
    if (combined.length > this.maximum) {
      this.truncated = true;
      this.bytes = combined.subarray(combined.length - this.maximum);
      return;
    }
    this.bytes = combined;
  }
  text() {
    const value = this.bytes.toString("utf8").trim();
    if (!value) {
      return "";
    }
    return this.truncated ? `[前部输出已截断]\n${value}` : value;
  }
}
function toBuffer(value: unknown) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return Buffer.from(typeof value === "string" ? value : String(value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
