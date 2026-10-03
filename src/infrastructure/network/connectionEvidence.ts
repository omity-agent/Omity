import { type DiagnosticsChannel, util } from "undici/index.js";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Duplex } from "node:stream";
import type { Socket } from "node:net";
import { TLSSocket } from "node:tls";

export const connectionContext = new AsyncLocalStorage<ConnectionEvidence>();
export class ConnectionEvidence {
  readonly startedAt = new Date().toISOString();
  readonly startedMs = performance.now();
  durationMs?: number;
  error?: Error;
  headers?: Headers;
  protocol?: "HTTP/1.1" | "HTTP/2";
  status?: number;
  route?: { type: "direct" } | { origin: string; type: "proxy" };
  closeRequestedBy?: "network-runtime";
  private socket?: Duplex;
  private peerSocket?: Socket;
  private peer?: {
    localAddress?: string;
    localPort?: number;
    remoteAddress?: string;
    remoteFamily?: string;
    remotePort?: number;
  };
  private tls?: { alpnProtocol: string | false | null; protocol: string | null };
  private lastReadAt?: number;
  private lastReadBytes?: number;
  private closeHadError?: boolean;
  private readonly state = {
    closed: false,
    dataEvents: 0,
    endReceived: false,
    finishReceived: false,
    timeoutReceived: false,
  };
  recordRoute(proxy?: string) {
    this.route = proxy ? { origin: new URL(proxy).origin, type: "proxy" } : { type: "direct" };
  }
  captureResponse(response: DiagnosticsChannel.Response) {
    const raw = response.headers,
      values = Array.isArray(raw) ? util.parseHeaders(raw) : raw;
    this.headers = new Headers(
      Object.entries(values).flatMap(([name, value]) =>
        (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(
          (entry): [string, string] => [name, entry],
        ),
      ),
    );
    this.protocol = Array.isArray(raw) ? "HTTP/1.1" : "HTTP/2";
    this.status = response.statusCode;
    this.durationMs = Math.round(performance.now() - this.startedMs);
  }
  fail(error: Error) {
    this.error = error;
    this.durationMs = Math.round(performance.now() - this.startedMs);
  }
  capturePeer(socket: Socket) {
    this.peerSocket = socket;
    this.peer = {
      localAddress: socket.localAddress,
      localPort: socket.localPort,
      remoteAddress: socket.remoteAddress,
      remoteFamily: socket.remoteFamily,
      remotePort: socket.remotePort,
    };
    if (socket instanceof TLSSocket) {
      this.tls = { alpnProtocol: socket.alpnProtocol, protocol: socket.getProtocol() };
    }
  }
  attach(socket: Duplex) {
    this.socket = socket;
    socket.once("error", (error: Error) => {
      this.error = error;
    });
    const received = (chunk: Buffer) => {
        this.lastReadAt = performance.now();
        this.lastReadBytes = chunk.byteLength;
        this.state.dataEvents += 1;
      },
      ended = () => {
        this.state.endReceived = true;
      },
      finished = () => {
        this.state.finishReceived = true;
      },
      timedOut = () => {
        this.state.timeoutReceived = true;
      },
      closed = (hadError?: boolean) => {
        this.state.closed = true;
        this.closeHadError = hadError;
        socket.off("data", received);
        socket.off("end", ended);
        socket.off("finish", finished);
        socket.off("timeout", timedOut);
      };
    socket.on("data", received);
    socket.once("end", ended);
    socket.once("finish", finished);
    socket.on("timeout", timedOut);
    socket.once("close", closed);
  }
  snapshot() {
    const { socket } = this;
    if (!socket) {
      return this.route ? { route: this.route } : undefined;
    }
    return {
      ...this.state,
      bytesRead: this.peerSocket?.bytesRead,
      bytesWritten: this.peerSocket?.bytesWritten,
      closeHadError: this.closeHadError,
      closeRequestedBy: this.closeRequestedBy,
      destroyed: socket.destroyed,
      lastReadAgeMs:
        this.lastReadAt === undefined ? undefined : Math.round(performance.now() - this.lastReadAt),
      lastReadBytes: this.lastReadBytes,
      peer: this.peer,
      readableEnded: socket.readableEnded,
      route: this.route,
      rstCode:
        "rstCode" in socket && typeof socket.rstCode === "number" ? socket.rstCode : undefined,
      tls: this.tls,
      writableFinished: socket.writableFinished,
    };
  }
}
