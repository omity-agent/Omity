import {
  maximumMcpStderrBytes,
  maximumMcpStdoutBytes,
} from "../../../../settings/diagnosticPolicy";
import type { Client } from "@modelcontextprotocol/client";
import { HandshakeEvidence } from "./handshakeEvidence";
import { ProcessOutputCapture } from "./diagnostics";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { StdioConnection } from "../configuration/connections";
import { Writable } from "node:stream";
import { connectProtocolClient } from "./protocol";
import messages from "../../../../settings/locales/zh-CN/connectionFailures.json";
import { observeStdioProcess } from "./processObservation";
import { reportMcpFailure } from "../failures/reportConstruction";

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
  const evidence = new HandshakeEvidence(),
    transport = new StdioClientTransport({
      args: connection.args,
      command: connection.command,
      cwd: connection.cwd,
      env: connection.env,
      stderr: "pipe",
    }),
    { stderr } = transport,
    diagnostics = new ProcessOutputCapture(maximumMcpStderrBytes),
    stdout = new ProcessOutputCapture(maximumMcpStdoutBytes),
    processSnapshot = observeStdioProcess(transport, (chunk) => {
      if (evidence.isRecording()) {
        stdout.append(chunk);
      }
    });
  // oxlint-disable-next-line unicorn/prefer-add-event-listener -- MCP transport 不是 EventTarget。
  transport.onerror = (error) => {
    evidence.record(error);
  };
  if (stderr === null) {
    throw reportMcpFailure(new Error(messages.stderrUnavailable), {
      connection: { kind: "stdio", options: connection },
      server: serverName,
      stage: "spawn",
    });
  }
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
    const process = processSnapshot();
    throw reportMcpFailure(error, {
      ...evidence.snapshot(),
      connection: { kind: "stdio", options: connection },
      process,
      server: serverName,
      stage: process.pid === null || evidence.spawnFailed() ? "spawn" : "initialize",
      stderr: diagnostics.snapshot(),
      stdout: stdout.snapshot(),
    });
  } finally {
    evidence.stop();
  }
};
