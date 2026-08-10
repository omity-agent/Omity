import { afterEach, expect, test } from "bun:test";
import { createTestDirectory, testArtifactsRoot } from "../support/artifacts";
import { join, resolve } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { safeId, sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { loadHookRules } from "../../src/infrastructure/configuration/hookRules";
import { loadSettings } from "../../src/infrastructure/configuration/settings/load";
import { resolveHookArgs } from "../../src/hooks/variables";
import { userDataDirectory } from "../../src/infrastructure/configuration/settings/files";
import { writeTestConfiguration } from "../support/configuration";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("settings use the unified user data directory", () => {
  const root = createTestDirectory("configuration");
  dirs.push(root);
  writeTestConfiguration(root);
  const settings = loadSettings(root);
  const directory = resolve(testArtifactsRoot, "user-data");
  expect(userDataDirectory()).toBe(directory);
  expect(settings).not.toHaveProperty("paths");
  expect(settings.model.reasoning_effort).toBe("medium");
  expect(settings.server).toEqual({ host: "127.0.0.1", port: 3030 });
  expect(settings.toolExecution.parallel).toBeTrue();
  expect(settings.toolOutput.maxTokens).toBe(8192);
  expect(settings.agent.systemPrompt).toBe("test\n\nuse skills");
  const paths = sessionPaths("abc-def");
  expect(paths).toEqual({
    dbPath: resolve(directory, "sessions", safeId("abc-def"), "agent.sqlite"),
    dir: resolve(directory, "sessions", safeId("abc-def")),
  });
  expect(() => sessionPaths("abc/def")).toThrow("路径 ID 无效");
  expect(() => sessionPaths("abc:def")).toThrow("路径 ID 无效");
});
test("prompt files expand current working directory placeholder", () => {
  const root = createTestDirectory("configuration");
  const workspace = join(root, "workspace");
  dirs.push(root);
  mkdirSync(workspace);
  writeTestConfiguration(root, {
    skillsPrompt: `skills from \${cwd}`,
    systemPrompt: `workspace: \${cwd}`,
  });
  const settings = loadSettings(root, { cwd: workspace });
  const displayedWorkspace = workspace.replaceAll("\\", "/");
  expect(settings.agent.systemPrompt).toBe(
    `workspace: ${displayedWorkspace}\n\nskills from ${displayedWorkspace}`,
  );
});
test("user settings deeply override defaults and preserve relative path semantics", () => {
  const root = createTestDirectory("layered-configuration");
  const userSettingsDir = join(root, "user-settings");
  dirs.push(root);
  writeTestConfiguration(root, {
    hooksYaml: `hooks:\n  - { id: default, target: agent, when: before, runLimit: 1, mode: silent, tool: default, args: {} }\n`,
  });
  const baseProfileDir = join(userSettingsDir, "profiles", "base");
  const profileDir = join(userSettingsDir, "profiles", "work");
  mkdirSync(baseProfileDir, { recursive: true });
  mkdirSync(join(profileDir, "prompts"), { recursive: true });
  writeFileSync(join(userSettingsDir, "profile.yaml"), "- base\n- work\n");
  writeFileSync(
    join(userSettingsDir, "main.yaml"),
    `server: { port: 4040 }\naccess:\n  loginRateLimit: { attempts: 3 }\n`,
  );
  writeFileSync(join(baseProfileDir, "model.yaml"), "model: base-model\ntimeoutMs: 2000\n");
  writeFileSync(join(profileDir, "model.yaml"), "model: user-model\n");
  writeFileSync(
    join(profileDir, "agent.yaml"),
    "recursionLimit: 7\nprompts:\n  - profile.md\n  - skills.md\n  - system.md\ntoolExecution: { parallel: false }\n",
  );
  writeFileSync(join(profileDir, "main.yaml"), "server: { port: 5050 }\n");
  writeFileSync(
    join(profileDir, "hooks.yaml"),
    `hooks:\n  - { id: user, target: agent, when: after, runLimit: 2, mode: takeover, tool: user, args: {} }\n`,
  );
  writeFileSync(join(profileDir, "prompts", "system.md"), "user system\n");
  writeFileSync(join(profileDir, "prompts", "profile.md"), "profile only\n");
  const settings = loadSettings(root, { userSettingsDir });
  expect(settings.server).toEqual({ host: "127.0.0.1", port: 4040 });
  expect(settings.access.loginRateLimit).toEqual({ attempts: 3, windowMs: 60_000 });
  expect([settings.model.adapter, settings.model.model]).toEqual(["completions", "user-model"]);
  expect(settings.model.timeoutMs).toBe(2000);
  expect(settings.agent.recursionLimit).toBe(7);
  expect(settings.toolExecution.parallel).toBeFalse();
  expect(settings.toolOutput.maxTokens).toBe(8192);
  expect(settings.skills.enabled).toBe(false);
  expect(settings.hooks.map(({ id }) => id)).toEqual(["user"]);
  expect(settings.agent.systemPrompt).toBe("profile only\n\nuse skills\n\nuser system");
});
test("model yaml contains one direct model configuration", () => {
  const root = createTestDirectory("configuration");
  dirs.push(root);
  writeTestConfiguration(root, {
    modelYaml: `adapter: codex
model: codex-model
retryDelayMs: 1000
timeoutMs: 2000
`,
  });
  expect(loadSettings(root).model).toEqual({
    adapter: "codex",
    model: "codex-model",
    retryDelayMs: 1000,
    timeoutMs: 2000,
  });
});
test("hook config parses targets, timing, and modes", () => {
  const root = createTestDirectory("hook-configuration");
  const path = join(root, "hooks.yaml");
  dirs.push(root);
  writeFileSync(
    path,
    `hooks:
  - id: user
    target: agent
    when: before
    runLimit: -1
    mode: takeover
    tool: format
    args: { path: . }
  - id: end
    target: agent
    when: after
    runLimit: 1
    mode: takeover
    tool: notify
    args: {}
  - id: before
    target: write
    when: before
    runLimit: 0
    mode: silent
    tool: lint
    args: {}
  - id: after
    target: write
    when: after
    runLimit: 2
    mode: takeover
    tool: verify
    args: {}
`,
  );
  expect(loadHookRules(path).map(({ target, when, mode }) => [target, when, mode])).toEqual([
    ["agent", "before", "takeover"],
    ["agent", "after", "takeover"],
    ["write", "before", "silent"],
    ["write", "after", "takeover"],
  ]);
});
test("hook variables preserve exact values and reject ambiguous output", () => {
  const previous = { files: ["a.ts", "b.ts"] };
  expect(
    resolveHookArgs(
      { cwd: `\${cwd}/src`, exact: `\${toolOutputs.fromEnd.1.output}` },
      { cwd: "F:\\work", toolOutputs: [{ output: previous }] },
    ),
  ).toEqual({ cwd: "F:/work/src", exact: previous });
  expect(() =>
    resolveHookArgs(
      { invalid: `result=\${toolOutputs.fromEnd.1.output}` },
      { cwd: "F:\\work", toolOutputs: [{ output: previous }] },
    ),
  ).toThrow("不能将数组或对象嵌入字符串");
  expect(() =>
    resolveHookArgs(
      { missing: `\${toolOutputs.fromEnd.1.output}` },
      { cwd: "F:\\work", toolOutputs: [] },
    ),
  ).toThrow("超出工具输出范围");
});
