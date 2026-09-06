import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { HookRule } from "../../src/types";
import { createSettingsContext } from "../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { parseHookRules } from "../../src/infrastructure/configuration/hookRules";
import { sessionHookOptions } from "../../src/app/runtime/sessionSnapshot";
import { stringify } from "yaml";

const rule: HookRule = {
  args: { output: `\${toolOutputs.fromEnd.1.output}`, path: `\${cwd}`, session: `\${session}` },
  id: "notify",
  mode: "silent",
  runLimit: -1,
  target: "agent",
  tool: "notify",
  when: "after",
};
test("Hook enable and description are optional and preserve explicit values", () => {
  expect(parseHookRules({ hooks: [rule] })).toEqual([rule]);
  expect(
    parseHookRules({ hooks: [{ ...rule, description: "完成后通知", enable: false }] }),
  ).toEqual([{ ...rule, description: "完成后通知", enable: false }]);
  expect(
    parseHookRules({ hooks: [{ ...rule, description: "", enable: true }] })[0]?.enable,
  ).toBeTrue();
});
test.each([
  { enable: "false" },
  { enable: null },
  { enable: 1 },
  { description: false },
  { description: null },
  { description: 42 },
])("Hook preferences reject invalid values: %j", (fields) => {
  expect(() => parseHookRules({ hooks: [{ ...rule, ...fields }] })).toThrow();
});
test("Hook preferences retain strict field and duplicate ID validation", () => {
  expect(() => parseHookRules({ hooks: [{ ...rule, enabled: true }] })).toThrow();
  expect(() => parseHookRules({ hooks: [rule, { ...rule, enable: false }] })).toThrow(
    "Hook id 重复",
  );
});
test("Hook options follow profile priority without exposing arguments or requiring a session", () => {
  const root = createTestDirectory("hook-options"),
    user = join(root, "user"),
    profile = join(user, "profiles", "work");
  try {
    mkdirSync(join(root, "settings"), { recursive: true });
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(root, "settings", "hooks.yaml"), stringify({ hooks: [rule] }));
    writeFileSync(
      join(profile, "hooks.yaml"),
      stringify({
        hooks: [{ ...rule, description: "工作提醒", enable: false, id: "work-notify" }],
      }),
    );
    const context = createSettingsContext(root, user);
    expect(sessionHookOptions(context)).toEqual([
      { description: undefined, enable: true, id: "notify" },
    ]);
    expect(sessionHookOptions(context, "work")).toEqual([
      { description: "工作提醒", enable: false, id: "work-notify" },
    ]);
    expect(sessionHookOptions(context)).toEqual([
      { description: undefined, enable: true, id: "notify" },
    ]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
