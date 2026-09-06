import { type DisplayEvent, type DisplayQueue, buildTimeline } from "../../../src/app/timeline";
import { expect, test } from "bun:test";
import { formatToolInput } from "../../../src/fileLinks/toolInput";

const queue: DisplayQueue[] = [
  { content: "run", error: null, id: 1, status: "running", userMessageId: 1 },
];
function delta(id: number, text: string, index = 0, freeform = false): DisplayEvent {
  return {
    id,
    kind: "tool_call_delta",
    messageId: "message-1",
    partId: `tool-${index.toString()}`,
    queueId: 1,
    value: { argumentsDelta: text, freeform, index },
  };
}
function calls(events: DisplayEvent[]) {
  return buildTimeline([], queue, events).flatMap((message) =>
    message.parts.flatMap((part) => (part.type === "tool" ? [part.call] : [])),
  );
}
test("invalid streamed prefixes retain the last successful YAML projection across replays", () => {
  const events = [delta(1, String.raw`{"command":"first\nsecond\nthird"`)],
    before = calls(events)[0]!;
  events.push(delta(2, ',"waiting":'));
  const invalid = calls(events)[0]!;
  expect(formatToolInput(invalid)).toBe(formatToolInput(before));
  expect(invalid.inputText).toBe(String.raw`{"command":"first\nsecond\nthird","waiting":`);
  expect(formatToolInput(calls([...events])[0]!)).toBe(formatToolInput(before));
  events.push(delta(3, "10}"));
  expect(calls(events)[0]?.input).toEqual({
    command: "first\nsecond\nthird",
    waiting: 10,
  });
});
test("a stream with no parseable prefix remains empty instead of rendering raw arguments", () => {
  expect(formatToolInput(calls([delta(1, '{"value":tru')])[0]!)).toBe("");
});
test("parallel tool calls retain their own successful input independently", () => {
  const events = [delta(1, '{"first":1'), delta(2, '{"second":2', 1), delta(3, ',"pending":')];
  expect(calls(events).map((call) => call.input)).toEqual([{ first: 1 }, { second: 2 }]);
});
test("Freeform streams keep every raw increment without JSON parsing", () => {
  const events = [delta(1, "*** Begin Patch\n", 0, true), delta(2, '+{"value":tru', 0, true)];
  expect(formatToolInput(calls(events)[0]!)).toBe('*** Begin Patch\n+{"value":tru');
});
test("valid falsy JSON values replace previous parsed prefixes", () => {
  expect(calls([delta(1, "n"), delta(2, "ull")])[0]?.input).toBeNull();
  expect(formatToolInput(calls([delta(1, "0")])[0]!)).toBe("0");
});
