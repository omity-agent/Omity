import type { DisplayMessage, DisplayToolCall, ReasoningTranslation, TokenUsage } from "./records";
import type { FilePathMatch } from "../../../fileLinks/types";
import type { StreamEvent } from "../../../types";
import type { ToolOutputSnapshot } from "../../../runtime/toolOutput";

export type {
  DisplayMessage,
  DisplayQueue,
  DisplayToolCall,
  ReasoningTranslation,
  TokenUsage,
} from "./records";
export type DisplayRole = DisplayMessage["role"];
export type ToolCallPhase = "streaming" | "pending" | "running" | "completed";
export function canCancelToolCall(phase: ToolCallPhase) {
  return phase === "pending" || phase === "running";
}
export type DisplayEvent = StreamEvent;
export type DisplayToolOutput = ToolOutputSnapshot & { fileLinks?: FilePathMatch[] };
export interface TimelineMessage {
  id: number;
  key: string;
  optimistic?: true;
  pending?: true;
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
