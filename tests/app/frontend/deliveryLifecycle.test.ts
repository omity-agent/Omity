import { expect, spyOn, test } from "bun:test";
import { subscribeEvents } from "../../../src/app/frontend/services/events/delivery";

class TestEventSource extends EventTarget {
  closed = false;
  close() {
    this.closed = true;
  }
}
test("event delivery isolates handler failures and keeps subsequent events synchronous", () => {
  const source = new TestEventSource(),
    failure = new Error("invalid event"),
    received: string[] = [],
    errors = spyOn(console, "error").mockReturnValue(undefined),
    close = subscribeEvents(source, {
      broken() {
        throw failure;
      },
      delta(event) {
        received.push(event.type);
      },
    });
  try {
    source.dispatchEvent(new Event("broken"));
    source.dispatchEvent(new Event("delta"));
    expect(errors.mock.calls).toEqual([[failure]]);
    expect(received).toEqual(["delta"]);
  } finally {
    close();
    errors.mockRestore();
  }
});
test("closing an event subscription removes its handlers and is idempotent", () => {
  const source = new TestEventSource(),
    received: Event[] = [],
    close = subscribeEvents(source, {
      delta: (event) => {
        received.push(event);
      },
    });
  source.dispatchEvent(new Event("delta"));
  close();
  close();
  source.dispatchEvent(new Event("delta"));
  expect(source.closed).toBe(true);
  expect(received).toHaveLength(1);
});
