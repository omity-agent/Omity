import { I18nextProvider, initReactI18next } from "react-i18next";
import { expect, test } from "bun:test";
import { Actions } from "../../../src/app/frontend/components/Chat/Composer/controls";
import { ContextUsage } from "../../../src/app/frontend/components/Chat/ContextUsage";
import type { TokenUsage } from "../../../src/app/timeline";
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
  Promise.resolve();
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
test("cleanup stays enabled while running", () => {
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
      />
    </I18nextProvider>,
  );
  expect(runtimeButton(markup, "清空 Agent 临时文件")).not.toContain(' disabled=""');
});
test("unmaterialized sessions do not expose temporary cleanup", () => {
  expect(renderActions({ controlDisabled: false, controlState: "resume" })).not.toContain(
    "清空 Agent 临时文件",
  );
});
test.each([
  { cacheReadTokens: 639, color: "accent.red", estimatedCacheHitRate: 0.8 },
  { cacheReadTokens: 640, color: "accent.green", estimatedCacheHitRate: 0.8 },
  { cacheReadTokens: 750, color: "accent.green", estimatedCacheHitRate: 0.8 },
  { cacheReadTokens: 0, color: "accent.green", estimatedCacheHitRate: 0 },
] as const)("cache hit rate uses the unrounded 80 percent threshold: %j", (value) => {
  const usage = {
      cacheReadTokens: value.cacheReadTokens,
      estimatedCacheHitRate: value.estimatedCacheHitRate,
      inputTokens: 1000,
      outputTokens: 200,
    },
    percentage = `${((value.cacheReadTokens / 1000) * 100).toFixed(2)}%`;
  expect(renderUsage(usage)).toContain(`<span class="c_${value.color}">${percentage}</span>`);
});
test("no usage remains neutral and zero input usage stays finite", () => {
  expect(renderUsage(null)).toContain('<span class="c_mutedStrong">—</span>');
  expect(
    renderUsage({
      cacheReadTokens: 0,
      estimatedCacheHitRate: 0,
      inputTokens: 0,
      outputTokens: 0,
    }),
  ).toContain('<span class="c_accent.green">0.00%</span>');
});
test("cache warning threshold follows the frontend configuration", () => {
  const usage = {
    cacheReadTokens: 700,
    estimatedCacheHitRate: 1,
    inputTokens: 1000,
    outputTokens: 100,
  };
  expect(renderUsage(usage, 0.8)).toContain('<span class="c_accent.red">70.00%</span>');
  expect(renderUsage(usage, 0.6)).toContain('<span class="c_accent.green">70.00%</span>');
});
function renderUsage(usage: TokenUsage | null, cacheHitWarningRatio = 0.8) {
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ContextUsage cacheHitWarningRatio={cacheHitWarningRatio} usage={usage} />
    </I18nextProvider>,
  );
}
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
