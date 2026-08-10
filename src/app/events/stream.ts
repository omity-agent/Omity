import { AsyncQueuer } from "@tanstack/pacer/async-queuer";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";

export interface OutboundEvent {
  data: unknown;
  event: string;
  id: string;
}
export type EventWriter = (event: OutboundEvent) => void;
export function eventStream(c: Context, subscribe: (write: EventWriter) => () => void) {
  const response = streamSSE(c, async (stream) => {
    const closed = Promise.withResolvers<void>(),
      writes = new AsyncQueuer<OutboundEvent>(
        async ({ data, event, id }) => {
          await stream.writeSSE({
            data: JSON.stringify(data),
            event,
            id,
          });
        },
        {
          concurrency: 1,
          onError: closed.reject,
        },
      ),
      write: EventWriter = (event) => {
        if (!writes.addItem(event)) {
          closed.reject(new Error(`SSE 写入队列拒绝事件：${event.event}`));
        }
      },
      unsubscribe = subscribe(write);
    stream.onAbort(() => {
      closed.resolve();
    });
    try {
      await closed.promise;
    } finally {
      unsubscribe();
      writes.clear();
      writes.abort();
    }
  });
  response.headers.set("content-type", "text/event-stream; charset=utf-8");
  return response;
}
