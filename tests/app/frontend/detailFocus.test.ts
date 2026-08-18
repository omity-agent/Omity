import type { TimelineMessage, TimelinePart } from "../../../src/app/timeline";
import { expect, test } from "bun:test";
import { findLatestDetails } from "../../../src/app/frontend/components/Chat/detailFocus";

test("keeps the latest reasoning and tool details active", () => {
  expect(
    findLatestDetails([
      message("details", [reasoning(), tool("first"), reasoning(), tool("last")]),
    ]),
  ).toEqual({
    reasoning: { messageKey: "details", partIndex: 2 },
    tool: { messageKey: "details", partIndex: 3 },
  });
});
test("keeps a terminal detail active when only one type exists", () => {
  expect(findLatestDetails([message("reasoning", [reasoning()])])).toEqual({
    reasoning: { messageKey: "reasoning", partIndex: 0 },
  });
  expect(findLatestDetails([message("tool", [tool("only")])])).toEqual({
    tool: { messageKey: "tool", partIndex: 0 },
  });
});
test("clears the active reasoning detail when answer content starts", () => {
  expect(findLatestDetails([message("answer", [reasoning(), content()])])).toEqual({});
});
test("clears the active tool detail when answer content starts", () => {
  expect(findLatestDetails([message("answer", [tool("answer"), content()])])).toEqual({});
});
function message(key: string, parts: TimelinePart[]): TimelineMessage {
  return {
    content: "",
    createdAt: 0,
    id: 1,
    key,
    parts,
    role: "assistant",
  };
}
function content(): TimelinePart {
  return { content: "answer", type: "content" };
}
function reasoning(): TimelinePart {
  return { content: "analysis", type: "reasoning" };
}
function tool(id: string): TimelinePart {
  return {
    call: { id, index: 0, input: {}, inputTokens: 0, name: "read" },
    key: id,
    phase: "streaming",
    type: "tool",
  };
}
