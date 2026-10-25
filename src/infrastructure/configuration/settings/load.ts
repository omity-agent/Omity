import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { localize } from "../../../i18n/server";
import { buildSkillsList } from "../../../skills";
import type { Settings } from "../../../types";
import { resolveConfiguredPath } from "../configuredPath";
import { loadConfiguredHookRules } from "../hookRules";
import { readSettingsText } from "../placeholders";
import { safeId } from "../sessionPaths";
import { normalizeWorkspacePath } from "../workspacePath";
import { createSettingsContext, type SettingsContext } from "./context";
import { readLayeredSettingsYaml, resolveLayeredSettingsText, userDataDirectory } from "./files";
import { prepareMainSettings } from "./models";
import {
  omitCodexConnectionSettings,
  parseAgentSettings,
  parseMainSettings,
  parseModelSettings,
} from "./schema";

interface LoadSettingsOptions {
  cwd?: string;
  sessionId?: string;
  settingsContext?: SettingsContext;
  userSettingsDir?: string;
}
export function loadSettings(root = process.cwd(), options: LoadSettingsOptions = {}): Settings {
  const configRoot = resolve(root),
    cwd = normalizeWorkspacePath(options.cwd ?? configRoot, configRoot),
    context = options.settingsContext ?? createSettingsContext(configRoot, options.userSettingsDir),
    main = parseMainSettings(
      requireLayeredYaml(
        context,
        "global",
        "main.yaml",
        {},
        {
          beforePlaceholders: prepareMainSettings,
        },
      ).value,
    ),
    agent = parseAgentSettings(requireLayeredYaml(context, "profile", "agent.yaml").value),
    model = parseModelSettings(
      requireLayeredYaml(
        context,
        "profile",
        "model.yaml",
        {},
        {
          beforePlaceholders: omitCodexConnectionSettings,
        },
      ).value,
    ),
    storageDirectory = userDataDirectory(),
    session = options.sessionId
      ? resolve(storageDirectory, "sessions", safeId(options.sessionId))
      : undefined,
    placeholders = {
      deferSession: true,
      session: { cwd, session },
    },
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
          readSettingsText(
            resolveLayeredSettingsText(context, "profile", join("prompts", file)),
            promptPlaceholders,
          ).trimEnd(),
        )
        .join("\n\n"),
    },
    hooks: loadConfiguredHookRules(context, placeholders),
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
  transforms: Parameters<typeof readLayeredSettingsYaml>[4] = {},
) {
  const file = readLayeredSettingsYaml(context, scope, relativePath, placeholders, transforms);
  if (!file) {
    throw new Error(
      localize("configuration:settings.fileMissing", {
        value0: resolve(context.defaultsDirectory, relativePath),
      }),
    );
  }
  return file;
}
