import type { TimelineMessage, TimelinePart } from "../../../src/app/timeline";
import { expect, test } from "bun:test";
import { findLatestDetail } from "../../../src/app/frontend/components/Chat/detailFocus";

test("keeps a terminal reasoning or tool detail active", () => {
  expect(findLatestDetail([message("reasoning", [reasoning()])])).toEqual({
    messageKey: "reasoning",
    partIndex: 0,
  });
  expect(findLatestDetail([message("tool", [reasoning(), tool()])])).toEqual({
    messageKey: "tool",
    partIndex: 1,
  });
});
test("clears the active reasoning detail when answer content starts", () => {
  expect(findLatestDetail([message("answer", [reasoning(), content()])])).toBeUndefined();
});
test("clears the active tool detail when answer content starts", () => {
  expect(findLatestDetail([message("answer", [tool(), content()])])).toBeUndefined();
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
function tool(): TimelinePart {
  return {
    call: { id: "call", index: 0, input: {}, inputTokens: 0, name: "read" },
    key: "call",
    phase: "streaming",
    type: "tool",
  };
}
