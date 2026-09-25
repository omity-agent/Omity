import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import {
  estimateCacheHitRate,
  readCacheExpectation,
} from "../../../src/agent/model/cacheExpectation";
import { expect, test } from "bun:test";
import { countTokens } from "../../../src/runtime/tokenizer";
import { toModelMessages } from "../../../src/agent/aiMessages";

test("first request has no cached prefix to expect", () => {
  const messages = [new HumanMessage("你好")];
  expect(estimateCacheHitRate(messages, toModelMessages(messages))).toBe(0);
});
test("uses the latest input usage and counts the assistant, tool and user suffix", () => {
  const messages = [
      new HumanMessage("较早的问题"),
      response(100),
      new HumanMessage("本轮问题"),
      response(1200, [{ args: { command: "检查状态" }, id: "call", name: "shell" }]),
      new ToolMessage({ content: "执行结果", tool_call_id: "call" }),
      new AIMessage("Hook 生成的消息"),
      new HumanMessage("补充要求"),
    ],
    converted = toModelMessages(messages),
    suffixTokens = countTokens(JSON.stringify(converted.slice(3)));
  expect(estimateCacheHitRate(messages, converted)).toBe(1200 / (1200 + suffixTokens));
});
test("zero previous input usage does not create an invalid estimate", () => {
  const messages = [new HumanMessage("问题"), response(0), new HumanMessage("继续")];
  expect(estimateCacheHitRate(messages, toModelMessages(messages))).toBe(0);
});
test.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER])(
  "rejects invalid or overflowing input token counts: %s",
  (tokens) => {
    const messages = [new HumanMessage("问题"), response(tokens)];
    expect(() => estimateCacheHitRate(messages, toModelMessages(messages))).toThrow();
  },
);
test.each([-0.1, 1.1, Number.NaN, "0.9"])("rejects an invalid stored estimate: %s", (rate) => {
  const message = new AIMessage({
    content: "答案",
    response_metadata: { estimatedCacheHitRate: rate },
  });
  expect(() => readCacheExpectation(message)).toThrow();
});
function response(inputTokens: number, toolCalls?: AIMessage["tool_calls"]) {
  return new AIMessage({
    content: "答案",
    tool_calls: toolCalls,
    usage_metadata: {
      input_token_details: { cache_read: 0 },
      input_tokens: inputTokens,
      output_tokens: 10,
      total_tokens: inputTokens + 10,
    },
  });
}
