import { type EventWriter, eventStream } from "./stream";
import type { BrowserWarning } from "../../types";
import type { Context } from "hono";
import type { SessionInfo } from "../sessionState";
import mitt from "mitt";
import { randomUUID } from "node:crypto";

interface StateEvents {
  [key: string]: unknown;
  [key: symbol]: unknown;
  deleted: Versioned<string>;
  session: Versioned<SessionInfo>;
  warning: Versioned<BrowserWarning>;
}
interface Versioned<T> {
  id: string;
  value: T;
}
export class StateChannel {
  private readonly bus = mitt<StateEvents>();
  private readonly epoch = randomUUID();
  private sequence = 0;
  notifySession(session: SessionInfo) {
    this.bus.emit("session", this.version(session));
  }
  notifyDeleted(sessionId: string) {
    this.bus.emit("deleted", this.version(sessionId));
  }
  notifyWarning(warning: BrowserWarning) {
    this.bus.emit("warning", this.version(warning));
  }
  stream(c: Context, getSessions: () => SessionInfo[]) {
    return eventStream(c, (write) => {
      const session = (item: Versioned<SessionInfo>) => {
          writeState(write, "session", item, item.value);
        },
        deleted = (item: Versioned<string>) => {
          writeState(write, "deleted", item, { sessionId: item.value });
        },
        warning = (item: Versioned<BrowserWarning>) => {
          writeState(write, "warning", item, item.value);
        };
      this.bus.on("session", session);
      this.bus.on("deleted", deleted);
      this.bus.on("warning", warning);
      const snapshot = this.version({ sessions: getSessions() });
      writeState(write, "sessions", snapshot, snapshot.value);
      return () => {
        this.bus.off("session", session);
        this.bus.off("deleted", deleted);
        this.bus.off("warning", warning);
      };
    });
  }
  private version<T>(value: T): Versioned<T> {
    this.sequence += 1;
    return { id: `${this.epoch}:${this.sequence.toString()}`, value };
  }
}
function writeState(write: EventWriter, event: string, item: Versioned<unknown>, data: unknown) {
  write({ data, event, id: item.id });
}
