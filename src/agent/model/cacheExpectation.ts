import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ModelMessage } from "ai";
import { z } from "zod";

import { localize } from "../../i18n/server";
import { countTokens } from "../../runtime/tokenizer";

const expectation = z.object({
  estimatedCacheHitRate: z.number().min(0).max(1).optional(),
});
export function estimateCacheHitRate(messages: BaseMessage[], modelMessages: ModelMessage[]) {
  const previousIndex = messages.findLastIndex(
      (message) => AIMessage.isInstance(message) && message.usage_metadata !== undefined,
    ),
    previous = messages[previousIndex];
  if (!previous || !AIMessage.isInstance(previous) || !previous.usage_metadata) {
    return 0;
  }
  const previousTokens = previous.usage_metadata.input_tokens;
  if (!Number.isSafeInteger(previousTokens) || previousTokens < 0) {
    throw new Error(localize("agent:model.cachePreviousTokensInvalid"));
  }
  if (previousTokens === 0) {
    return 0;
  }
  const suffixTokens = countTokens(JSON.stringify(modelMessages.slice(previousIndex))),
    estimatedInputTokens = previousTokens + suffixTokens;
  if (!Number.isSafeInteger(estimatedInputTokens)) {
    throw new Error(localize("agent:model.cacheInputTokensUnsafe"));
  }
  return previousTokens / estimatedInputTokens;
}
export function readCacheExpectation(message: BaseMessage) {
  return expectation.parse(message.response_metadata);
}
