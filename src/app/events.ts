import type { BrowserWarning } from "../types";
import { ContentChannel } from "./events/contentChannel";
import type { Context } from "hono";
import type { DisplayEvent } from "./timeline";
import type { SessionInfo } from "./sessionState";
import { StateChannel } from "./events/stateChannel";
import mitt from "mitt";
import { setTimeout as sleep } from "node:timers/promises";

interface Events {
  [key: string]: unknown;
  [key: symbol]: unknown;
  wake: string;
}
export class AppEvents {
  private readonly bus = mitt<Events>();
  private readonly content = new ContentChannel();
  private readonly state = new StateChannel();
  notifySession(session: SessionInfo) {
    this.state.notifySession(session);
  }
  notifyDeleted(sessionId: string) {
    this.state.notifyDeleted(sessionId);
  }
  notifyWarning(warning: BrowserWarning) {
    this.state.notifyWarning(warning);
  }
  invalidateTranscript(sessionId: string, eventCursor: number) {
    this.content.invalidate(sessionId, eventCursor);
  }
  notifyTranscript(sessionId: string, event: DisplayEvent) {
    this.content.notify(sessionId, event);
  }
  wake(sessionId: string) {
    this.bus.emit("wake", sessionId);
  }
  wait(sessionId: string, delayMs: number) {
    const waiting = Promise.withResolvers<void>();
    let settled = false;
    const handler = (changedSessionId: string) => {
        if (changedSessionId !== sessionId) {
          return;
        }
        done();
      },
      done = () => {
        if (settled) {
          return;
        }
        settled = true;
        this.bus.off("wake", handler);
        waiting.resolve();
      };
    this.bus.on("wake", handler);
    void (async () => {
      await sleep(delayMs);
      done();
    })();
    return waiting.promise;
  }
  streamState(c: Context, getSessions: () => SessionInfo[]) {
    return this.state.stream(c, getSessions);
  }
  streamContent(c: Context, sessionId: string, getEventCursor: () => number) {
    return this.content.stream(c, sessionId, getEventCursor);
  }
}
