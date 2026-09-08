import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { type LanguageModel, type TextStreamPart, type ToolSet, streamText } from "ai";
import { aiRequestOptions, buildAiModel, modelApi } from "./provider";
import { ModelEmptyResponseError } from "../../runtime/network";
import type { Settings } from "../../types";
import { fromModelMessages } from "../fromAiMessages";
import { toModelMessages } from "../aiMessages";

interface ModelRequestOptions {
  freeformToolNames?: ReadonlySet<string>;
  messages: BaseMessage[];
  model?: LanguageModel;
  sessionId: string;
  settings: Settings;
  signal?: AbortSignal;
  tools: ToolSet;
  write?: (part: AiStreamEvent) => void;
}
export interface AiStreamEvent {
  freeform?: true;
  part: TextStreamPart<ToolSet>;
}
export async function streamAiModel(options: ModelRequestOptions) {
  const attempts = new Map<number, AbortController>(),
    completed = Promise.withResolvers<AIMessage>();
  let finished = false,
    nextAttemptId = 0,
    winnerId: number | undefined;
  const interval = setInterval(() => {
    if (winnerId === undefined) {
      startAttempt();
    }
  }, options.settings.model.timeoutMs);
  startAttempt();
  try {
    return await completed.promise;
  } finally {
    clearInterval(interval);
    abortAttempts();
  }
  function abortAttempts(except?: number) {
    for (const [id, controller] of attempts) {
      if (id !== except) {
        controller.abort(new DOMException("其他模型请求已返回首个 Chunk", "AbortError"));
      }
    }
  }
  function selectWinner(id: number, parts: AiStreamEvent[]) {
    if (winnerId !== undefined) {
      return winnerId === id;
    }
    winnerId = id;
    clearInterval(interval);
    abortAttempts(id);
    for (const part of parts) {
      options.write?.(part);
    }
    return true;
  }
  async function runAttempt(
    id: number,
    controller: AbortController,
  ): Promise<AIMessage | undefined> {
    const buffered: AiStreamEvent[] = [];
    try {
      const result = streamText({
        abortSignal: options.signal
          ? AbortSignal.any([options.signal, controller.signal])
          : controller.signal,
        ...aiRequestOptions(options.settings, options.sessionId),
        maxRetries: 0,
        messages: toModelMessages(options.messages, modelApi(options.settings)),
        model: options.model ?? buildAiModel(options.settings),
        onError: () => undefined,
        temperature: options.settings.model.temperature,
        timeout: { chunkMs: options.settings.model.timeoutMs },
        tools: options.tools,
      });
      for await (const part of result.stream) {
        if (part.type === "error") {
          throw part.error;
        }
        const event: AiStreamEvent = {
          ...(part.type === "tool-input-start" && options.freeformToolNames?.has(part.toolName)
            ? { freeform: true }
            : {}),
          part,
        };
        if (winnerId === id) {
          options.write?.(event);
        } else if (winnerId !== undefined) {
          return undefined;
        } else {
          buffered.push(event);
          if (hasModelContent(part) && !selectWinner(id, buffered)) {
            return undefined;
          }
        }
      }
      if (winnerId !== id) {
        if (winnerId !== undefined) {
          return undefined;
        }
        throw new ModelEmptyResponseError();
      }
      const step = await result.finalStep,
        messages = fromModelMessages(step.response.messages, step.response.id, step.usage),
        response = messages.findLast((message) => AIMessage.isInstance(message));
      if (!response || (!response.tool_calls?.length && !response.text)) {
        throw new ModelEmptyResponseError();
      }
      return response;
    } finally {
      attempts.delete(id);
    }
  }
  async function monitorAttempt(id: number, controller: AbortController) {
    try {
      const response = await runAttempt(id, controller);
      if (!finished && winnerId === id && response) {
        finished = true;
        completed.resolve(response);
      }
    } catch (error) {
      if (!finished && (winnerId === id || (winnerId === undefined && attempts.size === 0))) {
        finished = true;
        completed.reject(error);
      }
    }
  }
  function startAttempt() {
    const id = nextAttemptId++,
      controller = new AbortController();
    attempts.set(id, controller);
    void monitorAttempt(id, controller);
  }
}
export function hasModelContent(part: TextStreamPart<ToolSet>) {
  switch (part.type) {
    case "file":
    case "reasoning-file":
    case "tool-call": {
      return true;
    }
    case "reasoning-delta":
    case "text-delta": {
      return part.text.length > 0;
    }
    case "tool-input-delta": {
      return part.delta.length > 0;
    }
    default: {
      return false;
    }
  }
}
