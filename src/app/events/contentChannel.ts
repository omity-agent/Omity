import { type OutboundEvent, eventStream } from "./stream";
import type { Context } from "hono";
import type { DisplayEvent } from "../timeline";
import mitt from "mitt";

export class ContentChannel {
  private readonly bus = mitt<Record<`session:${string}`, OutboundEvent>>();
  notify(sessionId: string, event: DisplayEvent) {
    this.bus.emit(`session:${sessionId}`, {
      data: event,
      event: "delta",
      id: event.id.toString(),
    });
  }
  invalidate(sessionId: string, eventCursor: number) {
    this.bus.emit(`session:${sessionId}`, contentSync(eventCursor));
  }
  stream(c: Context, sessionId: string, getEventCursor: () => number) {
    return eventStream(c, (write) => {
      const key = `session:${sessionId}` as const,
        snapshot = contentSync(getEventCursor());
      this.bus.on(key, write);
      write(snapshot);
      return () => {
        this.bus.off(key, write);
        if (this.bus.all.get(key)?.length === 0) {
          this.bus.all.delete(key);
        }
      };
    });
  }
}
function contentSync(eventCursor: number): OutboundEvent {
  return {
    data: { eventCursor },
    event: "sync",
    id: eventCursor.toString(),
  };
}
