import type { HookRule, LogLevel, ModelApi, ReasoningEffort } from "../../../types";

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
