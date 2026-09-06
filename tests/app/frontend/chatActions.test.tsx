import { I18nextProvider, initReactI18next } from "react-i18next";
import { expect, test } from "bun:test";
import { Actions } from "../../../src/app/frontend/components/Chat/Composer/controls";
import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";

const i18n = createInstance();
await i18n.use(initReactI18next).init({
  lng: "zh-CN",
  resources: {
    "zh-CN": {
      translation: {
        cancelPause: "取消暂停",
        clearTemporaryFiles: "清空 Agent 临时文件",
        contextUsage: "上下文",
        kvCache: "KV Cache",
        pausing: "正在暂停",
        resumeContinuous: "继续持续运行",
        send: "发送",
        step: "向前一步",
        stepping: "单步执行中",
      },
    },
  },
});
const handleControl: NonNullable<Parameters<typeof Actions>[0]["onControl"]> = () =>
    Promise.resolve(),
  usage = { cacheReadTokens: 50, inputTokens: 100, outputTokens: 20 };
function handleDelete() {
  return Promise.resolve();
}
test("pending pause remains an enabled cancel action", () => {
  const button = runtimeButton(
    renderActions({
      controlDisabled: false,
      controlState: "pausing",
    }),
    "取消暂停",
  );
  expect(button).not.toContain(' disabled=""');
});
test("running step keeps resume enabled and disables only the step action", () => {
  const markup = renderActions({
      controlDisabled: false,
      controlState: "stepping",
    }),
    resume = runtimeButton(markup, "继续持续运行"),
    step = runtimeButton(markup, "单步执行中");
  expect(resume).not.toContain(' disabled=""');
  expect(step).toContain(' disabled=""');
});
test("cleanup stays enabled while running and action buttons contain no visible text", () => {
  const markup = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <Actions
        controlDisabled={false}
        controlState="pause"
        deleteDisabled
        onControl={handleControl}
        onDelete={handleDelete}
        sessionId="active-session"
        submitDisabled={false}
        usage={usage}
      />
    </I18nextProvider>,
  );
  expect(runtimeButton(markup, "清空 Agent 临时文件")).not.toContain(' disabled=""');
  for (const button of markup.matchAll(/<button\b[^>]*>(?<content>.*?)<\/button>/gs)) {
    expect(button.groups?.["content"]?.replace(/<[^>]*>/g, "")).toBe("");
  }
  expect(markup).toContain("上下文");
  expect(markup).toContain("KV Cache");
  expect(markup).toContain("50.00%");
});
test("unmaterialized sessions do not expose temporary cleanup", () => {
  expect(renderActions({ controlDisabled: false, controlState: "resume" })).not.toContain(
    "清空 Agent 临时文件",
  );
});
function renderActions(
  props: Pick<Parameters<typeof Actions>[0], "controlDisabled" | "controlState">,
) {
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <Actions
        controlDisabled={props.controlDisabled}
        controlState={props.controlState}
        deleteDisabled
        submitDisabled
        onControl={handleControl}
      />
    </I18nextProvider>,
  );
}
function runtimeButton(markup: string, label: string) {
  const button = new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(markup)?.[0];
  expect(button).toBeDefined();
  return button ?? "";
}
