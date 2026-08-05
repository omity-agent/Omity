import { afterEach, expect, test } from "bun:test";
import { buildSkillsList, loadSkills } from "../../src/skills";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { HumanMessage } from "@langchain/core/messages";
import type { Settings } from "../../src/types";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { loadSettings } from "../../src/infrastructure/configuration/settings/load";
import { modelMessages } from "../../src/agent";
import { writeTestConfiguration } from "../support/configuration";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("loads enabled skills from SKILL.md front matter", () => {
  const skillsDir = makeSkillsDir();
  writeSkill(skillsDir, "code", "code", "代码任务");
  writeSkill(skillsDir, "web", "web", "联网查询");
  const settings = makeSettings(skillsDir, { web: false });
  expect(loadSkills(settings)).toEqual([
    {
      description: "代码任务",
      name: "code",
      source: join(skillsDir, "code", "SKILL.md"),
    },
  ]);
  expect(buildSkillsList(settings)).toBe([skillsDir, "└── code/SKILL.md # 代码任务"].join("\n"));
});
test("does not append an implicit skills message", () => {
  const settings = makeSettings("unused", {});
  settings.agent.systemPrompt = "system prompt";
  expect(
    modelMessages(settings, [new HumanMessage("hello")]).map((message) => message.text),
  ).toEqual(["system prompt", "hello"]);
});
test("expands the skills placeholder at its configured position", () => {
  const root = makeSkillsDir();
  const skillsDir = join(root, "available");
  mkdirSync(skillsDir);
  writeSkill(skillsDir, "code", "code", "代码任务");
  writeTestConfiguration(root, {
    agentYaml: `recursionLimit: 1
prompts:
  - skills.md
  - system.md
toolOutput:
  maxTokens: 8192
skills:
  enabled: true
  directory: ${skillsDir.replaceAll("\\", "/")}
  skillEnabled: {}
`,
    skillsPrompt: `before\n\${skills}\nafter`,
  });
  expect(loadSettings(root).agent.systemPrompt).toBe(
    ["before", skillsDir, "└── code/SKILL.md # 代码任务", "after", "", "test"].join("\n"),
  );
});
function makeSkillsDir() {
  const dir = createTestDirectory("skills");
  dirs.push(dir);
  return dir;
}
function writeSkill(skillsDir: string, dirname: string, name: string, description: string) {
  const dir = join(skillsDir, dirname);
  mkdirSync(dir);
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "${description}"\n---\n\nbody\n`,
  );
}
function makeSettings(skillsDir: string, skillEnabled: Record<string, boolean>): Settings {
  return {
    access: {
      challengeTtlMs: 300_000,
      loginRateLimit: { attempts: 10, windowMs: 60_000 },
      publicOrigin: "https://omity.example.test",
      sessionTtlMs: 43_200_000,
      trustedProxies: ["127.0.0.1/32"],
    },
    agent: {
      recursionLimit: 10,
      systemPrompt: "test",
    },
    attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
    frontend: {
      draftSaveDelayMs: 1,
      transcriptRefreshIntervalMs: 1,
    },
    hooks: [],
    host: {
      idleLogMs: 1,
      pausePollMs: 1,
      pollMs: 1,
      shutdownTimeoutMs: 1000,
    },
    leases: { hostTtlMs: 30_000 },
    logging: {
      level: "error",
      streamTokens: false,
    },
    model: {
      adapter: "completions",
      apiKeyEnv: "TEST_OPENAI_KEY",
      baseURL: null,
      model: "test-model",
      retryDelayMs: 1000,
      temperature: 0,
      timeoutMs: 1000,
    },
    paths: { dataDir: "data" },
    server: { host: "127.0.0.1", port: 3030 },
    skills: {
      directory: skillsDir,
      enabled: true,
      skillEnabled,
    },
    toolOutput: {
      maxTokens: 8192,
    },
  };
}
