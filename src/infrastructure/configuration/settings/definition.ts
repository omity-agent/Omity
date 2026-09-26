import type { parseAgentSettings, parseMainSettings, parseModelSettings } from "./schema";
import type { HookRule } from "../../../types";

type ParsedModel = ReturnType<typeof parseModelSettings>;
type ParsedMain = ReturnType<typeof parseMainSettings>;
export type ModelSettings =
  | Exclude<ParsedModel, { adapter: "codex" }>
  | (Extract<ParsedModel, { adapter: "codex" }> & { apiKeyEnv?: never; baseURL?: never });
type FrozenModel<T> = T extends ModelSettings
  ? Omit<
      T,
      "apiKeyEnv" | "maxConcurrentRequests" | "raceIntervalMs" | "retryDelayMs" | "temperature"
    >
  : never;
export type ModelPrefixSettings = FrozenModel<ModelSettings>;
export type Settings = ParsedMain &
  Pick<ReturnType<typeof parseAgentSettings>, "skills" | "toolExecution" | "toolOutput"> & {
    model: ModelSettings;
    hooks: HookRule[];
    agent: {
      recursionLimit: number;
      systemPrompt: string;
    };
  };
