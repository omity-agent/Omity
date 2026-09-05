import { type OutboundEvent, eventStream } from "./stream";
import type { Context } from "hono";
import type { DisplayEvent } from "../timeline";
import mitt from "mitt";

type ScopedEvent = OutboundEvent & { sessionId: string };
export class ContentChannel {
  private readonly bus = mitt<{ broadcast: ScopedEvent }>();
  notify(sessionId: string, event: DisplayEvent) {
    this.bus.emit("broadcast", {
      data: event,
      event: "delta",
      id: event.id.toString(),
      sessionId,
    });
  }
  invalidate(sessionId: string, eventCursor: number) {
    this.bus.emit("broadcast", { ...contentSync(eventCursor), sessionId });
  }
  stream(c: Context, sessionId: string, getEventCursor: () => number) {
    return eventStream(c, (write) => {
      const forward = (value: ScopedEvent) => {
        if (value.sessionId === sessionId) {
          write(value);
        }
      };
      this.bus.on("broadcast", forward);
      write(contentSync(getEventCursor()));
      return () => {
        this.bus.off("broadcast", forward);
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
