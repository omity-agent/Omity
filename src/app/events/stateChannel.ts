import { type EventWriter, eventStream } from "./stream";
import type { Context } from "hono";
import type { SessionInfo } from "../sessionState";
import mitt from "mitt";
import { randomUUID } from "node:crypto";

interface StateEvents {
  [key: string]: unknown;
  [key: symbol]: unknown;
  deleted: Versioned<string>;
  session: Versioned<SessionInfo>;
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
  stream(c: Context, getSessions: () => SessionInfo[]) {
    return eventStream(c, (write) => {
      const session = (item: Versioned<SessionInfo>) => {
        writeState(write, "session", item, item.value);
      };
      const deleted = (item: Versioned<string>) => {
        writeState(write, "deleted", item, { sessionId: item.value });
      };
      this.bus.on("session", session);
      this.bus.on("deleted", deleted);
      const snapshot = this.version({ sessions: getSessions() });
      writeState(write, "sessions", snapshot, snapshot.value);
      return () => {
        this.bus.off("session", session);
        this.bus.off("deleted", deleted);
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
