import { beforeAll, expect, test } from "bun:test";
import { DisclosureProvider } from "../../../src/app/frontend/components/Transcript/disclosures";
import { Frame } from "../../../src/app/frontend/components/Details/Frame";
import { Wrench } from "lucide-react";
import { i18nReady } from "../../../src/app/frontend/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { useToolAccessory } from "../../../src/app/frontend/components/Details/ToolAccessory";

const releaseDetail = () => undefined,
  registerDetail = () => releaseDetail;
beforeAll(async () => {
  await i18nReady;
});
function RunningTool({ open }: { open: boolean }) {
  const accessory = useToolAccessory({
    callId: "running-tool",
    cancellable: true,
    onCancel: async () => undefined,
    phase: "running",
  });
  return (
    <DisclosureProvider registerDetail={registerDetail}>
      <Frame
        accessory={accessory}
        expandedInitially={open}
        icon={Wrench}
        label="Example tool"
        stateKey="running-tool"
        title="example"
        tone="tool"
      >
        <p>Tool output</p>
      </Frame>
    </DisclosureProvider>
  );
}
test.each([true, false])(
  "tool disclosure uses an accessible trigger with a separate stop control (open: %s)",
  async (open) => {
    const markup = renderToStaticMarkup(<RunningTool open={open} />),
      buttons: Record<string, string>[] = [],
      contentIds: string[] = [],
      nestedControls: string[] = [],
      summaries: string[] = [],
      rewriter = new HTMLRewriter()
        .on("button", {
          element(element) {
            buttons.push(Object.fromEntries(element.attributes));
          },
        })
        .on('[data-part="content"]', {
          element(element) {
            contentIds.push(element.getAttribute("id") ?? "");
          },
        })
        .on("button button, summary button, summary a[href], summary input, summary select", {
          element(element) {
            nestedControls.push(element.tagName);
          },
        })
        .on("summary", {
          element(element) {
            summaries.push(element.tagName);
          },
        });
    await rewriter.transform(new Response(markup)).text();
    expect(buttons).toHaveLength(2);
    const [trigger, stop] = buttons;
    expect(trigger).toMatchObject({
      "aria-expanded": String(open),
      "aria-label": "Example tool",
      "data-part": "trigger",
      "data-scope": "collapsible",
      type: "button",
    });
    expect(trigger?.["aria-controls"]).toBeTruthy();
    if (open) {
      const controlledId = trigger?.["aria-controls"];
      if (!controlledId) {
        throw new Error("Disclosure trigger is missing its controlled content identifier");
      }
      expect(contentIds).toEqual([controlledId]);
    }
    expect(stop?.["aria-expanded"]).toBeUndefined();
    expect(stop?.["aria-controls"]).toBeUndefined();
    expect(stop?.["aria-label"]).toBeTruthy();
    expect(nestedControls).toEqual([]);
    expect(summaries).toEqual([]);
  },
);
