import { type SettingsContext, createSettingsContext } from "./context";
import { join, resolve } from "node:path";
import { parseAgentSettings, parseMainSettings, parseModelSettings } from "./schema";
import { readLayeredSettingsYaml, resolveLayeredSettingsText, userDataDirectory } from "./files";
import type { Settings } from "../../../types";
import { buildSkillsList } from "../../../skills";
import { isHookOutputVariable } from "../../../hooks/variables";
import { mkdirSync } from "node:fs";
import { normalizeWorkspacePath } from "../workspacePath";
import { parseHookRules } from "../hookRules";
import { readSettingsText } from "../placeholders";
import { resolveConfiguredPath } from "../configuredPath";
import { safeId } from "../sessionPaths";

export interface LoadSettingsOptions {
  cwd?: string;
  sessionId?: string;
  settingsContext?: SettingsContext;
  userSettingsDir?: string;
}
export function loadSettings(root = process.cwd(), options: LoadSettingsOptions = {}): Settings {
  const configRoot = resolve(root),
    cwd = normalizeWorkspacePath(options.cwd ?? configRoot, configRoot),
    context = options.settingsContext ?? createSettingsContext(configRoot, options.userSettingsDir),
    main = parseMainSettings(requireLayeredYaml(context, "global", "main.yaml").value),
    agent = parseAgentSettings(requireLayeredYaml(context, "profile", "agent.yaml").value),
    model = parseModelSettings(requireLayeredYaml(context, "profile", "model.yaml").value),
    storageDirectory = userDataDirectory(),
    session = options.sessionId
      ? resolve(storageDirectory, "sessions", safeId(options.sessionId))
      : undefined,
    placeholders = {
      deferSession: true,
      session: { cwd, session },
    },
    hooks = requireLayeredYaml(context, "profile", "hooks.yaml", {
      ...placeholders,
      deferred: isHookOutputVariable,
    }),
    skills = {
      ...agent.skills,
      directory: resolveConfiguredPath(configRoot, agent.skills.directory),
    };
  let skillsList: string | undefined;
  const promptPlaceholders = {
    ...placeholders,
    dynamic: (name: string) =>
      name === "skills"
        ? {
            matched: true,
            value: (skillsList ??= buildSkillsList({ skills })),
          }
        : { matched: false },
  };
  mkdirSync(storageDirectory, { recursive: true });
  return {
    ...main,
    agent: {
      recursionLimit: agent.recursionLimit,
      systemPrompt: agent.prompts
        .map((file) =>
          readPrompt(
            resolveLayeredSettingsText(context, "profile", join("prompts", file)),
            promptPlaceholders,
          ),
        )
        .join("\n\n"),
    },
    hooks: parseHookRules(hooks.value),
    model,
    skills,
    toolExecution: agent.toolExecution,
    toolOutput: agent.toolOutput,
  };
}
function requireLayeredYaml(
  context: SettingsContext,
  scope: Parameters<typeof readLayeredSettingsYaml>[1],
  relativePath: string,
  placeholders: Parameters<typeof readLayeredSettingsYaml>[3] = {},
) {
  const file = readLayeredSettingsYaml(context, scope, relativePath, placeholders);
  if (!file) {
    throw new Error(`配置文件不存在：${resolve(context.defaultsDirectory, relativePath)}`);
  }
  return file;
}
function readPrompt(path: string, placeholders: Parameters<typeof readSettingsText>[1]) {
  const content = readSettingsText(path, placeholders).trimEnd();
  return content;
}
