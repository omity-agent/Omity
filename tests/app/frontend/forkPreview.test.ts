import { expect, test } from "bun:test";
import { forkDraftTarget, previewFork } from "../../../src/app/frontend/services/transcript/fork";
import type { TimelineMessage } from "../../../src/app/timeline";
import { composerDraftKey } from "../../../src/app/frontend/services/composerDrafts";

const view = [
  message(1, "user", "第一条"),
  message(2, "assistant", "第一条回复"),
  message(3, "user", "需要编辑的 Fork 消息"),
  message(4, "assistant", "不会继承"),
];
test("fork previews inherit only messages before the selected user message", () => {
  const preview = previewFork(view, 3);
  expect(preview.draft).toBe("需要编辑的 Fork 消息");
  expect(preview.view).toEqual(view.slice(0, 2));
});
test("fork drafts use a browser-only identity derived from the source", () => {
  const target = forkDraftTarget({
    beforeMessageId: 3,
    kind: "fork",
    sourceSessionId: "source",
  });
  expect(composerDraftKey(target)).toBe("fork:source:3");
  expect(target).not.toHaveProperty("sessionId");
});
test("invalid fork points do not expose an unrelated transcript", () => {
  expect(previewFork(view, 2)).toEqual({ draft: undefined, view: [] });
});
function message(
  id: number,
  role: Extract<TimelineMessage["role"], "user" | "assistant">,
  content: string,
): TimelineMessage {
  return {
    content,
    createdAt: id,
    id,
    key: `message-${id.toString()}`,
    parts: [{ content, type: "content" }],
    role,
  };
}
