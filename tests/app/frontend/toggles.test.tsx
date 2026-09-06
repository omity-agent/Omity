import {
  HookToggle,
  Toggles,
} from "../../../src/app/frontend/components/NewSession/options/Toggles";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { expect, test } from "bun:test";
import { createInstance } from "i18next";
import messages from "../../../src/app/frontend/i18n/locales/zh-CN/app.json";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveHookSelection } from "../../../src/app/frontend/components/NewSession/options/selection";

const i18n = createInstance(),
  handleChange = () => undefined,
  describedHooks = [true, false].map((enable) => ({
    description: "完成后提醒",
    enable,
    id: "notify",
  })),
  plainHook = { enable: true, id: "plain" };
await i18n.use(initReactI18next).init({
  lng: "zh-CN",
  resources: { "zh-CN": { translation: messages } },
});
test("Hook switches expose their ID, state and optional accessible description", () => {
  for (const hook of describedHooks) {
    const markup = renderToStaticMarkup(
      <HookToggle disabled={false} hook={hook} onChange={handleChange} />,
    );
    expect(markup).toContain("notify");
    expect(markup).toContain("完成后提醒");
    expect(markup).toContain(`data-state="${hook.enable ? "checked" : "unchecked"}"`);
    expect(markup).toContain("aria-describedby=");
    expect(markup).toContain('role="switch"');
  }
});
test("Hook switches without descriptions do not render an empty description", () => {
  const markup = renderToStaticMarkup(
    <HookToggle disabled hook={plainHook} onChange={handleChange} />,
  );
  expect(markup).not.toContain("aria-describedby=");
  expect(markup).toContain('disabled=""');
});
test("Hook selections preserve false and exclude IDs from other profiles", () => {
  const hooks = [
      { enable: true, id: "notify" },
      { enable: false, id: "review" },
    ],
    values = new Map([
      ["notify", false],
      ["review", true],
      ["other-profile", true],
    ]);
  expect(resolveHookSelection(hooks, values)).toEqual([
    { enable: false, id: "notify" },
    { enable: true, id: "review" },
  ]);
  expect(resolveHookSelection(hooks, new Map())).toEqual(hooks);
});
test("Hook options distinguish loading, empty configuration and errors", () => {
  const selection = {
    error: null,
    handleChange,
    hooks: [],
    overrides: {},
    ready: false,
    reload: () => Promise.reject(new Error("测试不应发起重试")),
  };
  expect(renderOptions(selection)).toContain("正在加载 Hooks");
  expect(renderOptions({ ...selection, ready: true })).toContain("当前配置没有 Hook");
  const markup = renderOptions({ ...selection, error: new Error("配置无效") });
  expect(markup).toContain('role="alert"');
  expect(markup).toContain("配置无效");
  expect(markup).toContain("重试");
});
function renderOptions(selection: Parameters<typeof Toggles>[0]["selection"]) {
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <Toggles disabled={false} selection={selection} />
    </I18nextProvider>,
  );
}
