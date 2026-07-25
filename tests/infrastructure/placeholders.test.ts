import { afterEach, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { appDataRoot } from "../../src/infrastructure/configuration/placeholders";
import { createTestDirectory } from "../support/artifacts";
import { loadSettings } from "../../src/infrastructure/configuration/loadSettings";
import { resolveHookArgs } from "../../src/hooks/variables";
import { writeTestConfiguration } from "../support/configuration";

const directories: string[] = [];
const environmentName = "OMITY_TEST_PLACEHOLDER";
const previousEnvironment = process.env[environmentName];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
  if (previousEnvironment === undefined) {
    Reflect.deleteProperty(process.env, environmentName);
  } else {
    process.env[environmentName] = previousEnvironment;
  }
});
test("settings resolve global and session placeholders in their allowed scopes", () => {
  const root = createTestDirectory("placeholders");
  const workspace = join(root, "workspace");
  const environment = "placeholder-value";
  directories.push(root);
  process.env[environmentName] = environment;
  mkdirSync(workspace);
  writeTestConfiguration(root, {
    dataDir: `\${${environmentName}}/data`,
    hooksYaml: `hooks:
  - id: "\${session}"
    target: agent
    when: before
    runLimit: 1
    mode: takeover
    tool: inspect
    args:
      paths: "\${session}|\${cwd}|\${appData}|\${${environmentName}}"
      output: "\${toolOutputs.fromEnd.1.output}"
`,
    modelYaml: `profile: test
profiles:
  test:
    adapter: completions
    model: \${${environmentName}}
    apiKeyEnv: TEST_KEY
    baseURL: null
    timeoutMs: 1000
`,
    skillsPrompt: `skills: \${session}|\${cwd}|\${appData}|\${${environmentName}}`,
    systemPrompt: `system: \${session}|\${cwd}|\${appData}|\${${environmentName}}`,
  });
  const settings = loadSettings(root, { cwd: workspace, sessionId: "session-id" });
  expect(settings.paths.dataDir).toBe(resolve(root, environment, "data"));
  expect(settings.model.model).toBe(environment);
  const session = resolve(settings.paths.dataDir, "sessions", "session-id");
  const expanded = `${session}|${workspace}|${appDataRoot()}|${environment}`;
  expect(settings.agent.systemPrompt).toBe(`system: ${expanded}`);
  expect(settings.skills.usagePrompt).toBe(`skills: ${expanded}`);
  expect(settings.hooks[0]?.id).toBe(session);
  expect(settings.hooks[0]?.args).toEqual({
    output: `\${toolOutputs.fromEnd.1.output}`,
    paths: expanded,
  });
});
test("settings reject session placeholders outside prompts and hooks", () => {
  const root = createTestDirectory("placeholders");
  directories.push(root);
  writeTestConfiguration(root, { dataDir: `\${session}` });
  expect(() => loadSettings(root, { sessionId: "session-id" })).toThrow(
    `会话占位符 \${session} 没有可用值`,
  );
});
test("hook variables resolve the session directory", () => {
  const session = String.raw`F:\data\sessions\abc`;
  expect(
    resolveHookArgs(
      { path: `\${session}`, summary: `session=\${session}` },
      { cwd: String.raw`F:\work`, session, toolOutputs: [] },
    ),
  ).toEqual({ path: session, summary: `session=${session}` });
});
