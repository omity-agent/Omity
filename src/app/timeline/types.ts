import type { ErrorDetails } from "../../failures/details";
import type { FilePathMatch } from "../../fileLinks/types";
import type { QueueStatus } from "../../types";
import type { StreamEvent } from "../../infrastructure/database/records/streamEvents";
import type { ToolOutputSnapshot } from "../../runtime/toolOutput";

export type DisplayRole = "user" | "assistant" | "tool";
export interface DisplayImage {
  src: string;
  mimeType: string;
}
export interface DisplayToolCall {
  id: string;
  index: number;
  inputTokens: number;
  name: string;
  input: unknown;
  messageId?: string;
  inputText?: string;
  rawInput?: string;
  temporary?: true;
  fileLinks?: FilePathMatch[];
}
export type ToolCallPhase = "streaming" | "pending" | "running" | "completed";
export function canCancelToolCall(phase: ToolCallPhase) {
  return phase === "pending" || phase === "running";
}
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}
export interface DisplayMessage {
  id: number;
  sourceId?: string;
  role: DisplayRole;
  content: string;
  reasoning: string;
  images: DisplayImage[];
  queueId: number | null;
  toolCalls: DisplayToolCall[];
  toolCallId?: string;
  outputTokens?: number;
  usage?: TokenUsage;
  createdAt: number;
}
export interface ReasoningTranslation {
  messageId: string;
  source: string;
  targetLanguage: string;
  translated: string;
}
export interface DisplayQueue {
  id: number;
  content: string;
  status: QueueStatus;
  error: ErrorDetails | null;
  userMessageId?: number | null;
  root?: boolean;
}
export type DisplayEvent = StreamEvent;
export type DisplayToolOutput = ToolOutputSnapshot & { fileLinks?: FilePathMatch[] };
export interface TimelineMessage {
  id: number;
  key: string;
  optimistic?: true;
  role: DisplayRole;
  content: string;
  createdAt: number;
  usage?: TokenUsage;
  parts: TimelinePart[];
}
export type TimelinePart =
  | { type: "content"; content: string; fileLinks?: FilePathMatch[] }
  | {
      type: "reasoning";
      content: string;
      fileLinks?: FilePathMatch[];
      messageId?: string;
      streaming?: true;
      translations?: ReasoningTranslation[];
    }
  | {
      type: "tool";
      call: DisplayToolCall;
      key: string;
      phase: Exclude<ToolCallPhase, "completed">;
      output?: DisplayToolOutput;
    }
  | {
      type: "tool";
      call: DisplayToolCall;
      key: string;
      output: DisplayToolOutput;
      phase: "completed";
    };
