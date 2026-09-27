import type { Client } from "@modelcontextprotocol/client";
import { StderrCapture } from "./diagnostics";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { StdioConnection } from "../configuration/connections";
import { Writable } from "node:stream";
import { connectProtocolClient } from "./protocol";

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
    }),
    { stderr } = transport;
  if (stderr === null) {
    throw new Error(`MCP 服务器 ${serverName} 无法捕获 stderr`);
  }
  const diagnostics = new StderrCapture(maximumStderrBytes);
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
  try {
    const client = await connectProtocolClient(transport, { onclose: closeTransport, signal });
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
    const output = diagnostics.text(),
      message = error instanceof Error ? error.message : String(error);
    throw new Error(
      output
        ? `MCP stdio 服务器 "${serverName}" 连接失败：${message}\n\n子进程 stderr：\n${output}`
        : `MCP stdio 服务器 "${serverName}" 连接失败：${message}`,
      { cause: error },
    );
  }
};
