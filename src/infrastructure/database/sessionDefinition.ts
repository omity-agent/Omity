import {
  type McpToolSnapshot,
  emptyMcpToolSnapshot,
  snapshotMcpTools,
} from "../mcp/tools/definitions";
import type { ModelPrefixSettings, ModelSettings, Settings } from "../../types";
import { DomainError } from "../../errors";
import type { LoadedMcp } from "../mcp/tools/catalog";

export interface SessionDefinition {
  hookOverrides?: Record<string, boolean>;
  prefix: {
    model: ModelPrefixSettings | null;
    systemPrompt: string;
    tools: McpToolSnapshot;
  };
}
export function createSessionDefinition(
  settings: Settings,
  mcp: LoadedMcp,
  session: { cwd: string; session: string },
  hookOverrides?: Record<string, boolean>,
): SessionDefinition {
  const ids = new Set(settings.hooks.map(({ id }) => id));
  for (const id of Object.keys(hookOverrides ?? {})) {
    if (!ids.has(id)) {
      throw new DomainError("HOOK_SELECTION_INVALID", `Hook 不存在：${id}`);
    }
  }
  return {
    hookOverrides,
    prefix: {
      model: snapshotModel(settings.model),
      systemPrompt: settings.agent.systemPrompt,
      tools: snapshotMcpTools(mcp, session),
    },
  };
}
export function emptySessionDefinition(): SessionDefinition {
  return {
    prefix: {
      model: null,
      systemPrompt: "",
      tools: emptyMcpToolSnapshot(),
    },
  };
}
export function applySessionDefinition(
  settings: Settings,
  definition: SessionDefinition,
): Settings {
  const overrides = new Map(Object.entries(definition.hookOverrides ?? {}));
  return {
    ...settings,
    agent: {
      ...settings.agent,
      systemPrompt: definition.prefix.systemPrompt,
    },
    hooks: settings.hooks.map((rule) => ({
      ...rule,
      enable: overrides.get(rule.id) ?? rule.enable,
    })),
    model: restoreModel(settings.model, definition.prefix.model),
  };
}
function snapshotModel(settings: ModelSettings): ModelPrefixSettings {
  const shared = {
    model: settings.model,
    reasoning_effort: settings.reasoning_effort,
  };
  return settings.adapter === "codex"
    ? { ...shared, adapter: settings.adapter }
    : {
        ...shared,
        adapter: settings.adapter,
        baseURL: settings.baseURL,
      };
}
function restoreModel(current: ModelSettings, snapshot: ModelPrefixSettings | null): ModelSettings {
  if (!snapshot) {
    throw new Error("会话缺少模型前缀快照");
  }
  const runtime = {
    maxConcurrentRequests: current.maxConcurrentRequests,
    raceIntervalMs: current.raceIntervalMs,
    retryDelayMs: current.retryDelayMs,
    temperature: current.temperature,
  };
  if (snapshot.adapter === "codex") {
    return { ...runtime, ...snapshot };
  }
  if (current.adapter === "codex") {
    throw new Error("当前模型配置没有为会话锁定的远程模型提供 API Key 环境变量");
  }
  return {
    ...runtime,
    ...snapshot,
    apiKeyEnv: current.apiKeyEnv,
  };
}
