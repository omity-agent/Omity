import type { ErrorDetails } from "./failures/details";

export type Control = "running" | "step" | "pause" | "cancel" | "pause_cancel";
export type SessionStatus = "tool" | "model" | "idle" | "pausing" | "paused" | "error";
export interface BrowserWarning {
  code: "model_api_unavailable";
  details: {
    attempt: number;
    delayMs: number;
    error: ErrorDetails;
    queueId: number;
    sessionId: string;
  };
  message: string;
}
export interface HostMode {
  kind: "new" | "load" | "overwrite";
  sessionId: string;
  profile?: string;
}
export type QueueStatus = "draft" | "pending" | "running" | "paused" | "done" | "canceled";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ModelApi = "responses" | "completions";
interface SharedModelPrefixSettings {
  model: string;
  reasoning_effort?: ReasoningEffort;
}
interface RemoteModelPrefixSettings extends SharedModelPrefixSettings {
  adapter: ModelApi;
  baseURL: string | null;
}
interface CodexModelPrefixSettings extends SharedModelPrefixSettings {
  adapter: "codex";
  baseURL?: never;
}
interface ModelRuntimeSettings {
  retryDelayMs: number;
  temperature?: number;
  timeoutMs: number;
}
export type ModelPrefixSettings = RemoteModelPrefixSettings | CodexModelPrefixSettings;
export type ModelSettings = ModelRuntimeSettings &
  (
    | (RemoteModelPrefixSettings & {
        apiKeyEnv: string;
      })
    | (CodexModelPrefixSettings & {
        apiKeyEnv?: never;
      })
  );
export type HookMode = "silent" | "takeover";
export type HookWhen = "before" | "after";
export type HookTrigger = `${string}:${HookWhen}`;
export interface HookRule {
  id: string;
  target: string;
  when: HookWhen;
  runLimit: number;
  mode: HookMode;
  tool: string;
  args: Record<string, unknown>;
}
export interface Settings {
  server: {
    host: string;
    port: number;
  };
  access: {
    publicOrigin: string | null;
    trustedProxies: string[];
    challengeTtlMs: number;
    sessionTtlMs: number;
    loginRateLimit: {
      attempts: number;
      windowMs: number;
    };
  };
  attachments: {
    allowedSuffixes: string[];
    maxSizeBytes: number;
  };
  frontend: {
    draftSaveDelayMs: number;
    reasoningTranslation: {
      enabled: boolean;
      minimumIntervalMs: number;
    };
    transcriptSnapshotThrottleMs: number;
  };
  model: ModelSettings;
  host: {
    pollMs: number;
    pausePollMs: number;
    idleLogMs: number;
    shutdownTimeoutMs: number;
  };
  logging: {
    level: LogLevel;
    streamTokens: boolean;
  };
  leases: {
    hostTtlMs: number;
  };
  toolOutput: {
    maxTokens: number;
  };
  toolExecution: {
    parallel: boolean;
  };
  hooks: HookRule[];
  agent: {
    recursionLimit: number;
    systemPrompt: string;
  };
  skills: {
    enabled: boolean;
    directory: string;
    skillEnabled: Record<string, boolean>;
  };
}
export interface SkillInfo {
  name: string;
  description: string;
  source: string;
}
export interface QueueItem {
  id: number;
  runId: number | null;
  content: string;
  status: QueueStatus;
  userMessageId: number | null;
  root: boolean;
}
