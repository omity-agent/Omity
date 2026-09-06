import type { BrowserWarning } from "../types";
import { ContentChannel } from "./events/contentChannel";
import type { Context } from "hono";
import type { DisplayEvent } from "./timeline";
import type { SessionInfo } from "./sessionState";
import { StateChannel } from "./events/stateChannel";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";

export class AppEvents {
  private readonly bus = new EventTarget();
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
    this.bus.dispatchEvent(new Event(`wake:${sessionId}`));
  }
  async wait(sessionId: string, delayMs: number) {
    const controller = new AbortController(),
      { signal } = controller;
    try {
      await Promise.race([
        once(this.bus, `wake:${sessionId}`, { signal }),
        sleep(delayMs, undefined, { signal }),
      ]);
    } finally {
      controller.abort();
    }
  }
  streamState(c: Context, getSessions: () => SessionInfo[]) {
    return this.state.stream(c, getSessions);
  }
  streamContent(c: Context, sessionId: string, getEventCursor: () => number) {
    return this.content.stream(c, sessionId, getEventCursor);
  }
}
