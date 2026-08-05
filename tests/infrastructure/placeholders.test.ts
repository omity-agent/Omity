import { afterEach, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { appDataRoot } from "../../src/infrastructure/configuration/placeholders";
import { createTestDirectory } from "../support/artifacts";
import { loadSettings } from "../../src/infrastructure/configuration/settings/load";
import { loadUserEnvironment } from "../../src/infrastructure/configuration/settings/files";
import { resolveHookArgs } from "../../src/hooks/variables";
import { writeTestConfiguration } from "../support/configuration";

const directories: string[] = [];
const environmentName = "OMITY_TEST_PLACEHOLDER";
const loadedEnvironmentName = "OMITY_TEST_ENV_LOADED";
const presetEnvironmentName = "OMITY_TEST_ENV_PRESET";
const environmentNames = [environmentName, loadedEnvironmentName, presetEnvironmentName] as const;
const previousEnvironment = new Map(environmentNames.map((name) => [name, process.env[name]]));
const forwardSlashPath = (path: string) => path.replaceAll("\\", "/");
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, name);
    } else {
      process.env[name] = value;
    }
  }
});
test("user environment file fills missing variables without overriding the process", () => {
  const root = createTestDirectory("user-environment");
  const path = join(root, ".env");
  directories.push(root);
  Reflect.deleteProperty(process.env, loadedEnvironmentName);
  process.env[presetEnvironmentName] = "process";
  writeFileSync(path, `${loadedEnvironmentName}="from file"\n${presetEnvironmentName}=file\n`);
  loadUserEnvironment(path);
  expect(process.env[loadedEnvironmentName]).toBe("from file");
  expect(process.env[presetEnvironmentName]).toBe("process");
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
    modelYaml: `adapter: completions
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
  const session = forwardSlashPath(resolve(settings.paths.dataDir, "sessions", "session-id"));
  const expanded = `${session}|${forwardSlashPath(workspace)}|${appDataRoot()}|${environment}`;
  expect(settings.agent.systemPrompt).toBe(`system: ${expanded}\n\nskills: ${expanded}`);
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
      {
        path: `\${session}`,
        summary: `cwd=\${cwd}; session=\${session}`,
      },
      { cwd: String.raw`F:\work`, session, toolOutputs: [] },
    ),
  ).toEqual({
    path: "F:/data/sessions/abc",
    summary: "cwd=F:/work; session=F:/data/sessions/abc",
  });
});
