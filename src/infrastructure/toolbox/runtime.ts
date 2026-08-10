import { askUserAnswerInvalid, toolNotRunning } from "../../errors";
import type { AskUserRequest } from "./askUser";

export type AskUserAnswer =
  | { kind: "choice"; options: string[]; note: string }
  | { answer: string; kind: "open_ended" };
interface PendingQuestion {
  answered?: true;
  request: AskUserRequest;
  resolve: (answer: AskUserAnswer) => void;
}
export class AskUserRuntime {
  private readonly pending = new Map<string, PendingQuestion>();
  constructor(private readonly changed?: (sessionId: string) => void) {}
  async ask(request: AskUserRequest, sessionId: string, signal?: AbortSignal) {
    const key = this.key(sessionId, request.callId);
    if (this.pending.has(key)) {
      throw new Error(`ask_user 问题已在等待回答：${request.callId}`);
    }
    const deferred = Promise.withResolvers<AskUserAnswer>(),
      pending: PendingQuestion = { request, resolve: deferred.resolve };
    this.pending.set(key, pending);
    this.changed?.(sessionId);
    const abort = () => {
      if (this.pending.delete(key)) {
        this.changed?.(sessionId);
      }
      deferred.reject(signal?.reason instanceof Error ? signal.reason : new Error("工具已终止"));
    };
    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener("abort", abort, { once: true });
    }
    try {
      return await deferred.promise;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (this.pending.get(key) === pending) {
        this.pending.delete(key);
        this.changed?.(sessionId);
      }
    }
  }
  answer(sessionId: string, callId: string, answer: unknown) {
    const key = this.key(sessionId, callId),
      pending = this.pending.get(key);
    if (!pending) {
      throw toolNotRunning(callId);
    }
    if (pending.answered) {
      throw toolNotRunning(callId);
    }
    const parsed = parseAnswer(pending.request, answer);
    pending.answered = true;
    pending.resolve(parsed);
    return { toolCallId: callId };
  }
  question(sessionId: string) {
    const prefix = `${sessionId}:`;
    return [...this.pending.entries()].find(([key]) => key.startsWith(prefix))?.[1].request ?? null;
  }
  private key(sessionId: string, callId: string) {
    return `${sessionId}:${callId}`;
  }
}
function parseAnswer(request: AskUserRequest, answer: unknown): AskUserAnswer {
  if (request.kind === "open_ended") {
    if (!isRecord(answer) || typeof answer["answer"] !== "string") {
      throw askUserAnswerInvalid("open_ended 答案必须包含 answer 字符串");
    }
    return { answer: answer["answer"], kind: "open_ended" };
  }
  if (
    !isRecord(answer) ||
    !Array.isArray(answer["options"]) ||
    typeof answer["note"] !== "string"
  ) {
    throw askUserAnswerInvalid("choice 答案必须包含 options 字符串列表和 note 字符串");
  }
  const { options } = answer;
  if (!options.every((option): option is string => typeof option === "string")) {
    throw askUserAnswerInvalid("choice 答案中的 options 必须是字符串列表");
  }
  if (
    new Set(options).size !== options.length ||
    options.some((option) => !request.options.includes(option))
  ) {
    throw askUserAnswerInvalid("choice 答案包含题目没有提供的选项");
  }
  if (!request.multiple && options.length > 1) {
    throw askUserAnswerInvalid("单选题只能选择一个选项");
  }
  if (options.length === 0 && answer["note"].trim().length === 0) {
    throw askUserAnswerInvalid("没有备注时至少选择一个选项");
  }
  return { kind: "choice", note: answer["note"], options };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
