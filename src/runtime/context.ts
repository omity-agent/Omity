import type { BrowserWarning, SessionStatus, Settings } from "../types";
import type { AgentDatabase } from "../infrastructure/database/agentDatabase";
import { BaseMessage } from "@langchain/core/messages";
import type { BunSqliteSaver } from "../checkpointer";
import type { Logger } from "../infrastructure/logging/logger";
import type { StreamEvent } from "../infrastructure/database/records/streamEvents";
import type { ToolExecutions } from "../agent/toolExecutions";
import type { buildGraph } from "../agent";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";

type AgentGraph = ReturnType<typeof buildGraph>["graph"];
type AgentGraphStream = AgentGraph["stream"];
type GraphStreamOptions = Omit<
  NonNullable<Parameters<AgentGraphStream>[1]>,
  "interruptAfter" | "interruptBefore"
> & {
  interruptAfter: string[];
  interruptBefore: string[];
};
export interface HostObserver {
  activity?: (sessionId: string, status: Extract<SessionStatus, "tool" | "model" | "idle">) => void;
  changed?: (sessionId: string) => void;
  transcript?: (sessionId: string, event: StreamEvent) => void;
  token: (sessionId: string, queueId: number, text: string) => void;
  warning?: (sessionId: string, warning: BrowserWarning) => void;
}
export interface HostContext {
  assertLease?: () => void;
  checkpointer: BunSqliteSaver;
  controller: AbortController;
  db: AgentDatabase;
  graph: AgentGraph;
  logger: Logger;
  observer?: HostObserver;
  sessionId: string;
  settings: Settings;
  stopping?: AbortSignal;
  toolExecutions?: ToolExecutions;
  wake?: (delayMs: number) => Promise<void>;
}
interface WakeContext {
  controller: AbortController;
  wake?: (delayMs: number) => Promise<void>;
}
export async function streamGraph(
  graph: Pick<AgentGraph, "stream">,
  input: Parameters<AgentGraphStream>[0],
  options: GraphStreamOptions,
) {
  const stream: unknown = Reflect.get(graph, "stream");
  if (typeof stream !== "function") {
    throw new Error("LangGraph 缺少 stream 方法");
  }
  const result: unknown = await Reflect.apply(stream, graph, [input, options]);
  if (!isIterable(result)) {
    throw new Error("LangGraph stream 没有返回可迭代结果");
  }
  return result;
}
export function waitForWake(ctx: WakeContext, delayMs: number) {
  return ctx.wake ? ctx.wake(delayMs) : abortableSleep(delayMs, ctx.controller.signal);
}
async function abortableSleep(delayMs: number, signal: AbortSignal) {
  try {
    await sleep(delayMs, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) {
      throw error;
    }
  }
}
interface RuntimeGraphState extends Record<string, unknown> {
  next: string[];
  tasks: (Record<string, unknown> & { name: string })[];
  values: Record<string, unknown> & {
    hookPendingUserIds?: string[];
    hookPlan?: unknown;
    messages: BaseMessage[];
  };
}
const messageSchema = z.custom<BaseMessage>((value) => BaseMessage.isInstance(value));
const graphStateSchema = z.looseObject({
  next: z.array(z.string()),
  tasks: z.array(z.looseObject({ name: z.string() })),
  values: z.looseObject({
    hookPendingUserIds: z.array(z.string()).optional(),
    hookPlan: z.unknown().optional(),
    messages: z.array(messageSchema),
  }),
});
export function readGraphState(value: unknown): RuntimeGraphState {
  const parsed = graphStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("LangGraph 状态无效", { cause: parsed.error });
  }
  return parsed.data;
}
function isIterable(value: unknown): value is AsyncIterable<unknown> | Iterable<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    (typeof Reflect.get(value, Symbol.asyncIterator) === "function" ||
      typeof Reflect.get(value, Symbol.iterator) === "function")
  );
}
