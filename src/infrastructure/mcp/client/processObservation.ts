import { ChildProcess } from "node:child_process";
import type { McpFailure } from "../failures/wireFormat";
import type { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { localize } from "../../../i18n/server";

export function observeStdioProcess(
  transport: StdioClientTransport,
  recordStdout: (chunk: unknown) => void,
) {
  const start = transport.start.bind(transport),
    close = transport.close.bind(transport),
    state: NonNullable<McpFailure["process"]> = {
      closedByClient: false,
      exitCode: null,
      exited: false,
      pid: null,
      signal: null,
    };
  let child: ChildProcess | undefined;
  // Preserve the SDK transport prototype so protocol detection can use its temporary child process.
  transport.start = async () => {
    const starting = start(),
      spawned: unknown = Reflect.get(transport, "_process");
    if (!(spawned instanceof ChildProcess)) {
      await starting;
      throw new Error(localize("mcp:connection.processUnavailable"));
    }
    child = spawned;
    state.pid = spawned.pid ?? null;
    spawned.once("spawn", () => {
      state.pid = spawned.pid ?? null;
    });
    spawned.once("exit", (code, signal) => {
      state.exitCode = code;
      state.signal = signal;
      state.exited = true;
    });
    spawned.once("close", (code, signal) => {
      state.exitCode = code;
      state.signal = signal;
      state.exited = state.pid !== null;
    });
    spawned.stdout?.on("data", recordStdout);
    await starting;
  };
  transport.close = async () => {
    if (child && !state.exited) {
      state.closedByClient = true;
    }
    await close();
  };
  return () => ({ ...state });
}
