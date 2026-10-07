import { askUserAnswerInvalid, toolNotRunning } from "../../errors";
import type { AskUserRequest } from "./askUser";
import { isPlainObject as isRecord } from "es-toolkit";
import { localize } from "../../i18n/server";
import { raceSignal } from "race-signal";

type AskUserAnswer = { options: string[]; note: string } | { answer: string };
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
      throw new Error(
        localize("toolbox:askUser.questionAlreadyPending", { value0: request.callId }),
      );
    }
    const deferred = Promise.withResolvers<AskUserAnswer>(),
      pending: PendingQuestion = { request, resolve: deferred.resolve },
      cleanup = () => {
        if (this.pending.get(key) === pending) {
          this.pending.delete(key);
          this.changed?.(sessionId);
        }
      };
    this.pending.set(key, pending);
    this.changed?.(sessionId);
    try {
      return await raceSignal(deferred.promise, signal, {
        translateError: (aborted) => {
          cleanup();
          return aborted.reason instanceof Error
            ? aborted.reason
            : new Error(localize("toolbox:tool.terminated"));
        },
      });
    } finally {
      cleanup();
    }
  }
  answer(sessionId: string, callId: string, answer: unknown) {
    const key = this.key(sessionId, callId),
      pending = this.pending.get(key);
    if (!pending || pending.answered) {
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
      throw askUserAnswerInvalid(localize("toolbox:answer.openEndedStringMissing"));
    }
    return { answer: answer["answer"] };
  }
  if (
    !isRecord(answer) ||
    !Array.isArray(answer["options"]) ||
    typeof answer["note"] !== "string"
  ) {
    throw askUserAnswerInvalid(localize("toolbox:answer.choiceFieldsMissing"));
  }
  const { options } = answer;
  if (!options.every((option): option is string => typeof option === "string")) {
    throw askUserAnswerInvalid(localize("toolbox:answer.choiceOptionsNotStrings"));
  }
  if (
    new Set(options).size !== options.length ||
    options.some((option) => !request.options.includes(option))
  ) {
    throw askUserAnswerInvalid(localize("toolbox:answer.choiceOptionUnknown"));
  }
  if (!request.multiple && options.length > 1) {
    throw askUserAnswerInvalid(localize("toolbox:answer.singleChoiceMultiple"));
  }
  if (options.length === 0 && answer["note"].trim().length === 0) {
    throw askUserAnswerInvalid(localize("toolbox:answer.noteRequiresChoice"));
  }
  return { note: answer["note"], options };
}
