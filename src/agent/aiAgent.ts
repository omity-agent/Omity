import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { type LanguageModel, type TextStreamPart, type ToolSet, streamText } from "ai";
import { aiRequestOptions, buildAiModel, modelApi } from "./aiModel";
import { ModelEmptyResponseError } from "../runtime/network";
import type { Settings } from "../types";
import { fromModelMessages } from "./fromAiMessages";
import { toModelMessages } from "./aiMessages";

export interface AiModelOptions {
  freeformToolNames?: ReadonlySet<string>;
  messages: BaseMessage[];
  model?: LanguageModel;
  sessionId: string;
  settings: Settings;
  signal?: AbortSignal;
  tools: ToolSet;
  write?: (part: AiStreamEvent) => void;
}
export async function streamAiModel(options: AiModelOptions) {
  const result = streamText({
    abortSignal: options.signal,
    ...aiRequestOptions(options.settings, options.sessionId),
    maxRetries: 0,
    messages: toModelMessages(options.messages, modelApi(options.settings)),
    model: options.model ?? buildAiModel(options.settings),
    // Runtime catches stream errors and reports retryable ones through browser events.
    onError: () => undefined,
    temperature: options.settings.model.temperature,
    timeout: {
      chunkMs: options.settings.model.timeoutMs,
      firstChunkMs: options.settings.model.timeoutMs,
    },
    tools: options.tools,
  });
  for await (const part of result.stream) {
    if (part.type === "error") {
      throw part.error;
    }
    options.write?.({
      ...(part.type === "tool-input-start" && options.freeformToolNames?.has(part.toolName)
        ? { freeform: true }
        : {}),
      part,
    });
  }
  const step = await result.finalStep;
  const messages = fromModelMessages(step.response.messages, step.response.id, step.usage);
  const response = messages.findLast((message) => AIMessage.isInstance(message));
  if (!response || (!response.tool_calls?.length && !response.text)) {
    throw new ModelEmptyResponseError();
  }
  return response;
}
export interface AiStreamEvent {
  freeform?: true;
  part: TextStreamPart<ToolSet>;
}
