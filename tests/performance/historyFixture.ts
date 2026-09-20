import { AIMessage, type BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { ModelToolDefinition } from "../../src/infrastructure/mcp/tools/definitions";
import type { StoredAiSdkPart } from "../../src/agent/fromAiMessages";
import type { TypicalContext } from "./typicalProfile";
import assert from "node:assert/strict";
import { countTokens } from "../../src/runtime/tokenizer";
import { sum } from "es-toolkit";

function syntheticText(tokens: number) {
  assert(Number.isSafeInteger(tokens) && tokens >= 0, "合成文本的 token 数无效");
  const text = " log".repeat(tokens);
  assert.equal(countTokens(text), tokens, "合成文本与当前 tokenizer 不匹配");
  return text;
}
function allocateTokens(total: number, weights: number[]) {
  assert(Number.isSafeInteger(total) && total >= 0, "上下文 token 预算不足");
  const scale = sum(weights);
  assert(Number.isSafeInteger(scale) && scale > 0, "上下文长度权重之和无效");
  let accumulated = 0;
  return weights.map((weight, index) => {
    const before = Math.round(total * (accumulated / scale));
    accumulated += weight;
    return (
      (index === weights.length - 1 ? total : Math.round(total * (accumulated / scale))) - before
    );
  });
}
function distribute(total: number, count: number) {
  return allocateTokens(
    total,
    Array.from({ length: count }, () => 1),
  );
}
export function createTypicalHistory(context: TypicalContext) {
  const rounds = context.toolResultWeights.length,
    tools: ModelToolDefinition[] = Array.from({ length: context.toolDefinitions }, (_, index) => ({
      description: "",
      freeform: context.customToolCalls > 0 && index === 1,
      inputSchema: { properties: { input: { type: "string" } }, type: "object" },
      name: `bench__noop${index.toString()}`,
    })),
    descriptionBudget = context.definitionTokens - countTokens(JSON.stringify(tools));
  for (const [index, tokens] of distribute(descriptionBudget, tools.length).entries()) {
    tools[index]!.description = syntheticText(tokens);
  }
  const definitionTokens = countTokens(JSON.stringify(tools)),
    argumentSizes = distribute(
      context.argumentTokens - rounds * countTokens('{"input":""}'),
      rounds,
    ),
    argumentsList = argumentSizes.map((tokens) => ({ input: syntheticText(tokens) })),
    argumentTokens = sum(argumentsList.map((args) => countTokens(JSON.stringify(args)))),
    resultBudget =
      context.targetTokens -
      definitionTokens -
      argumentTokens -
      context.systemTokens -
      context.humanTokens -
      context.assistantTokens -
      context.reasoningTokens,
    results = allocateTokens(resultBudget, context.toolResultWeights),
    humans = distribute(context.humanTokens, context.humanMessages).map(syntheticText),
    texts = distribute(context.assistantTokens, context.assistantTextMessages).map(syntheticText),
    reasoning = distribute(context.reasoningTokens, context.reasoningParts).map(syntheticText),
    reasoningGroups = distribute(context.reasoningParts, context.reasoningMessages),
    encrypted = distribute(context.encryptedReasoningCharacters, context.reasoningMessages),
    messages: BaseMessage[] = [];
  let assistantIndex = 0,
    reasoningIndex = 0,
    humanIndex = 0;
  for (let index = 0; index < rounds; index += 1) {
    if (humanIndex < humans.length - 1 && index >= (humanIndex * rounds) / (humans.length - 1)) {
      messages.push(
        new HumanMessage({ content: humans[humanIndex]!, id: `user-${humanIndex.toString()}` }),
      );
      humanIndex += 1;
    }
    const callId = `history-call-${index.toString()}`,
      custom = index < context.customToolCalls,
      regularIndex = index % (context.distinctHistoryTools - (context.customToolCalls > 0 ? 1 : 0)),
      toolIndex = custom
        ? 1
        : context.customToolCalls > 0 && regularIndex > 0
          ? regularIndex + 1
          : regularIndex,
      { name, freeform } = tools[toolIndex]!,
      message = assistant();
    message.tool_calls = [
      {
        args: argumentsList[index]!,
        id: callId,
        name,
        type: "tool_call" as const,
        ...(freeform ? { isCustomTool: true } : {}),
      },
    ];
    messages.push(
      message,
      new ToolMessage({
        content: syntheticText(results[index]!),
        id: `result-${index.toString()}`,
        metadata: freeform ? { customTool: true } : undefined,
        name,
        tool_call_id: callId,
      }),
    );
  }
  for (let index = 0; index < context.assistantOnlyMessages; index += 1) {
    messages.push(assistant());
  }
  const pendingUser = humans.at(-1)!;
  return {
    estimatedTokens:
      definitionTokens +
      argumentTokens +
      sum(results) +
      context.systemTokens +
      context.humanTokens +
      context.assistantTokens +
      context.reasoningTokens,
    messages,
    pendingUser,
    systemPrompt: syntheticText(context.systemTokens),
    tools,
  };
  function assistant() {
    const index = assistantIndex++,
      textIndex =
        index >= rounds
          ? context.assistantTextMessages - context.assistantOnlyMessages + index - rounds
          : index,
      content =
        index < context.assistantTextMessages - context.assistantOnlyMessages || index >= rounds
          ? texts[textIndex]!
          : "",
      parts: StoredAiSdkPart[] = [];
    if (index < reasoningGroups.length) {
      const count = reasoningGroups[index]!;
      for (let part = 0; part < count; part += 1) {
        parts.push({
          providerOptions: {
            openai: {
              itemId: `reasoning-${index.toString()}`,
              ...(part === count - 1
                ? { reasoningEncryptedContent: "A".repeat(encrypted[index]!) }
                : {}),
            },
          },
          text: reasoning[reasoningIndex++]!,
          type: "reasoning",
        });
      }
    }
    if (content) {
      parts.push({ text: content, type: "text" });
    }
    return new AIMessage({
      additional_kwargs: { aiSdkContent: parts },
      content,
      id: `assistant-${index.toString()}`,
    });
  }
}
export type TypicalHistory = ReturnType<typeof createTypicalHistory>;
