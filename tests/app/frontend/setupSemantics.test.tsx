import { beforeAll, expect, test } from "bun:test";
import { ProfilePicker } from "../../../src/app/frontend/components/NewSession/ProfilePicker";
import { Toggles } from "../../../src/app/frontend/components/NewSession/options/Toggles";
import { WorkspacePicker } from "../../../src/app/frontend/components/NewSession/WorkspacePicker";
import { i18nReady } from "../../../src/app/frontend/i18n";
import { renderToStaticMarkup } from "react-dom/server";

const ignoreChange = () => undefined,
  pickWorkspace = async () => null,
  recentWorkspaces: string[] = [],
  availableProfiles = ["local"],
  hookSelection = {
    error: null,
    handleChange: ignoreChange,
    hooks: [{ enable: true, id: "example-hook" }],
    overrides: { "example-hook": true },
    ready: true,
    reload: async () => {
      throw new Error("Unexpected reload during markup rendering");
    },
  };
beforeAll(async () => {
  await i18nReady;
});
function workspacePicker(key: number) {
  return (
    <WorkspacePicker
      key={key}
      onChange={ignoreChange}
      onPick={pickWorkspace}
      recentWorkspaces={recentWorkspaces}
      workspace="F:/workspace/example"
    />
  );
}
async function elements(markup: string, selector: string) {
  const attributes: Record<string, string>[] = [],
    rewriter = new HTMLRewriter().on(selector, {
      element(element) {
        attributes.push(Object.fromEntries(element.attributes));
      },
    });
  await rewriter.transform(new Response(markup)).text();
  return attributes;
}
test("session setup fields have semantic names and associated native labels", async () => {
  const markup = renderToStaticMarkup(
      <form>
        {workspacePicker(0)}
        <ProfilePicker available={availableProfiles} onChange={ignoreChange} selected="local" />
      </form>,
    ),
    controls = await elements(markup, "input, select"),
    labels = await elements(markup, "label");
  expect(controls.map((control) => control["name"])).toEqual(["workspace", "profile"]);
  for (const control of controls) {
    expect(control["id"]).toBeTruthy();
    expect(labels.filter((label) => label["for"] === control["id"])).toHaveLength(1);
  }
});
test("repeated session setup components generate distinct field and label identifiers", async () => {
  const markup = renderToStaticMarkup(<form>{[0, 1].map(workspacePicker)}</form>),
    controls = await elements(markup, "input"),
    identified = await elements(markup, "[id]"),
    ids = identified.map((element) => element["id"]);
  expect(controls).toHaveLength(2);
  expect(controls.every((control) => Boolean(control["id"]))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
});
test("hook switches belong to a labelled fieldset instead of a single-control field", async () => {
  const markup = renderToStaticMarkup(<Toggles disabled={false} selection={hookSelection} />),
    fieldsets = await elements(markup, "fieldset"),
    legends = await elements(markup, "fieldset > legend"),
    switches = await elements(markup, 'fieldset input[type="checkbox"]');
  expect(fieldsets).toHaveLength(1);
  expect(legends).toHaveLength(1);
  expect(switches).toHaveLength(1);
  expect(switches[0]?.["id"]).toBeTruthy();
});
