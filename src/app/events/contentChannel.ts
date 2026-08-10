import type { Context } from "hono";
import type { DisplayEvent } from "../timeline";
import { eventStream } from "./stream";
import mitt from "mitt";

interface ContentDelta {
  event: DisplayEvent;
  sessionId: string;
}
interface ContentSync {
  eventCursor: number;
  sessionId: string;
}
interface ContentEvents {
  [key: string]: unknown;
  [key: symbol]: unknown;
  delta: ContentDelta;
  sync: ContentSync;
}
export class ContentChannel {
  private readonly bus = mitt<ContentEvents>();
  notify(sessionId: string, event: DisplayEvent) {
    this.bus.emit("delta", { event, sessionId });
  }
  invalidate(sessionId: string, eventCursor: number) {
    this.bus.emit("sync", { eventCursor, sessionId });
  }
  stream(c: Context, sessionId: string, getEventCursor: () => number) {
    return eventStream(c, (write) => {
      const delta = (value: ContentDelta) => {
          if (value.sessionId === sessionId) {
            write({
              data: value.event,
              event: "delta",
              id: value.event.id.toString(),
            });
          }
        },
        sync = (value: ContentSync) => {
          if (value.sessionId === sessionId) {
            writeSync(write, value.eventCursor);
          }
        };
      this.bus.on("delta", delta);
      this.bus.on("sync", sync);
      writeSync(write, getEventCursor());
      return () => {
        this.bus.off("delta", delta);
        this.bus.off("sync", sync);
      };
    });
  }
}
function writeSync(write: Parameters<Parameters<typeof eventStream>[1]>[0], eventCursor: number) {
  write({
    data: { eventCursor },
    event: "sync",
    id: eventCursor.toString(),
  });
}
