import { expect, test } from "bun:test";
import { SessionGroup } from "../../../src/app/frontend/components/Sidebar/SessionGroup";
import { groupSessions } from "../../../src/app/frontend/components/Sidebar/sessions";
import { navigateLink } from "../../../src/app/frontend/route";
import { renderToStaticMarkup } from "react-dom/server";

const noop = () => undefined;
test.each([
  { displayed: "当前会话标题", title: "当前会话标题" },
  { displayed: "RANDOM-SESSION-ID", title: "random-session-id" },
  { displayed: "Fix API regression", title: "Fix API regression" },
  { displayed: "&lt;script&gt;alert(1)&lt;/script&gt;", title: "<script>alert(1)</script>" },
])(
  "sidebar renders the title while navigation retains the session ID: %s",
  ({ displayed, title }) => {
    const [group] = groupSessions([
        {
          createdAt: 1,
          error: null,
          id: "random-session-id",
          status: "idle",
          title,
          updatedAt: 1,
          workspace: "F:/workspace",
        },
      ]),
      markup = renderToStaticMarkup(
        <SessionGroup group={group!} onSelect={noop} unreadIds={new Set()} />,
      );
    expect(markup).toContain('href="#/sessions/random-session-id"');
    expect(markup).toContain(`title="${displayed}"`);
    expect(markup).toContain(`aria-label="${displayed}"`);
    expect(markup).toContain(`>${displayed}</span>`);
    expect(markup).not.toContain(">#</span>");
    expect(markup).not.toContain("<script>");
  },
);
test.each([
  { button: 1 },
  { ctrlKey: true },
  { metaKey: true },
  { shiftKey: true },
  { altKey: true },
  { defaultPrevented: true },
])("modified navigation keeps browser behavior: %j", (modifier) => {
  const event = linkEvent(modifier);
  let navigated = false;
  navigateLink(event, () => {
    navigated = true;
  });
  expect(navigated).toBeFalse();
  expect(event.prevented).toBeFalse();
});
test("ordinary navigation prevents a document navigation and uses the page router", () => {
  const event = linkEvent({});
  let navigated = false;
  navigateLink(event, () => {
    navigated = true;
  });
  expect(navigated).toBeTrue();
  expect(event.prevented).toBeTrue();
});
function linkEvent(modifier: Partial<Parameters<typeof navigateLink>[0]>) {
  const event = {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    prevented: false,
    shiftKey: false,
    ...modifier,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}
