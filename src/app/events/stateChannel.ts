import type { BrowserWarning, SessionFailure, SessionInfo } from "./contracts";
import { type OutboundEvent, eventStream } from "./stream";
import type { Context } from "hono";
import mitt from "mitt";
import { randomUUID } from "node:crypto";

export class StateChannel {
  private readonly bus = mitt<{ broadcast: OutboundEvent }>();
  private readonly epoch = randomUUID();
  private sequence = 0;
  notifySession(session: SessionInfo) {
    this.bus.emit("broadcast", this.version("session", session));
  }
  notifyDeleted(sessionId: string) {
    this.bus.emit("broadcast", this.version("deleted", { sessionId }));
  }
  notifyWarning(warning: BrowserWarning) {
    this.bus.emit("broadcast", this.version("warning", warning));
  }
  notifyFailure(failure: SessionFailure) {
    this.bus.emit("broadcast", this.version("failure", failure));
  }
  stream(c: Context, getSessions: () => SessionInfo[]) {
    return eventStream(c, (write) => {
      const event = c.req.header("Last-Event-ID") ? "sessions" : "restore",
        snapshot = this.version(event, { sessions: getSessions() });
      this.bus.on("broadcast", write);
      write(snapshot);
      return () => {
        this.bus.off("broadcast", write);
      };
    });
  }
  private version(event: string, data: unknown): OutboundEvent {
    this.sequence += 1;
    return { data, event, id: `${this.epoch}:${this.sequence.toString()}` };
  }
}
