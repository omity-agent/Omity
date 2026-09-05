import {
  type McpToolSnapshot,
  emptyMcpToolSnapshot,
  snapshotMcpTools,
} from "../mcp/tools/definitions";
import type { ModelPrefixSettings, ModelSettings, Settings } from "../../types";
import type { LoadedMcp } from "../mcp/tools/catalog";

export interface SessionDefinition {
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
): SessionDefinition {
  return {
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
  return {
    ...settings,
    agent: {
      ...settings.agent,
      systemPrompt: definition.prefix.systemPrompt,
    },
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
    retryDelayMs: current.retryDelayMs,
    temperature: current.temperature,
    timeoutMs: current.timeoutMs,
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
