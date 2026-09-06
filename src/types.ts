import type { ErrorDetails } from "./failures/details";
import { z } from "zod";

export { streamEventSchema } from "./infrastructure/database/schema/streamEvent";
export type {
  StreamEvent,
  StreamEventDraft,
  StreamEventKind,
  StreamEventValues,
  ToolOutputSnapshot,
} from "./infrastructure/database/schema/streamEvent";
export type {
  ModelPrefixSettings,
  ModelSettings,
  Settings,
} from "./infrastructure/configuration/settings/definition";
export const controlSchema = z.enum(["running", "step", "pause", "cancel", "pause_cancel"]),
  controlCommandSchema = controlSchema.exclude(["pause_cancel"]),
  sessionStatusSchema = z.enum(["tool", "model", "idle", "pausing", "paused", "error"]),
  queueStatusSchema = z.enum(["pending", "running", "paused", "done", "canceled"]),
  logLevelSchema = z.enum(["debug", "info", "warn", "error"]),
  reasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]),
  modelApiSchema = z.enum(["responses", "completions"]);
export type Control = z.infer<typeof controlSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
export type ModelApi = z.infer<typeof modelApiSchema>;
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
type HookMode = "silent" | "takeover";
export type HookWhen = "before" | "after";
export type HookTrigger = `${string}:${HookWhen}`;
export interface HookRule {
  id: string;
  enable?: boolean;
  description?: string;
  target: string;
  when: HookWhen;
  runLimit: number;
  mode: HookMode;
  tool: string;
  args: Record<string, unknown>;
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
