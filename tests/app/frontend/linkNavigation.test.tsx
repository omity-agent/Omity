import { expect, test } from "bun:test";
import { Sidebar } from "../../../src/app/frontend/components/Sidebar";
import { navigateLink } from "../../../src/app/frontend/route";
import { renderToStaticMarkup } from "react-dom/server";

const sessions: Parameters<typeof Sidebar>[0]["sessions"] = [],
  noop = () => undefined;
test("the new session action exposes a native link", () => {
  const markup = renderToStaticMarkup(
    <Sidebar
      sessions={sessions}
      showCreate
      unreadIds={new Set()}
      onCreate={noop}
      onSelect={noop}
    />,
  );
  expect(markup).toMatch(/<a[^>]+href="#\/new"/u);
});
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
