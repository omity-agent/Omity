import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { HookRule } from "../../src/types";
import { createSettingsContext } from "../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { parseHookRules } from "../../src/infrastructure/configuration/hookRules";
import { resolveHookSelection } from "../../src/app/frontend/components/NewSession/options/selection";
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
