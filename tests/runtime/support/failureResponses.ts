import { MockLanguageModelV4 } from "ai/test";
import { createOpenAI } from "@ai-sdk/openai";
import { simulateReadableStream } from "ai";

const upstreamError = {
    code: "basispoints_upstream_error",
    message:
      "Excel BPS rejected this request (Invalid 'input[4].id': 'fc_omity-hook:example'. Expected an ID that contains letters, numbers, underscores, or dashes, but this value contained additional characters.); account scheduling was not changed",
    param: "",
    type: "invalid_request_error",
  },
  overloadError = {
    code: "server_error",
    message: "Our servers are currently overloaded. Please try again later.",
    type: "service_unavailable_error",
  },
  invalidError = {
    code: "invalid_request",
    message: "Invalid request",
    type: "invalid_request_error",
  };
export const providerFailures = [
  {
    errorName: "AI_APICallError",
    name: "upstream rejection despite HTTP 400 and isRetryable false",
    response: () => apiFailure(upstreamError, 400),
    retryable: true,
  },
  {
    errorName: "AI_TypeValidationError",
    name: "overloaded response.failed wrapped in a validation error",
    response: () => failedEvent(overloadError),
    retryable: true,
  },
  {
    name: "service unavailable without a recognized code",
    response: () => failedEvent({ ...overloadError, code: "unknown" }),
    retryable: true,
  },
  {
    name: "ordinary invalid request",
    response: () => apiFailure(invalidError, 400),
    retryable: false,
  },
  {
    name: "non-transient response.failed",
    response: () => failedEvent(invalidError),
    retryable: false,
  },
  {
    name: "usage limit despite HTTP 503 and server_error",
    response: () => apiFailure({ ...overloadError, type: "usage_limit_reached" }, 503),
    retryable: false,
  },
  {
    name: "usage limit despite upstream error code",
    response: () => apiFailure({ ...upstreamError, type: "usage_limit_reached" }, 400),
    retryable: false,
  },
];
function apiFailure(error: Record<string, string>, status: number) {
  return Response.json(
    { error },
    {
      headers: { "content-type": "text/event-stream" },
      status,
    },
  );
}
function failedEvent(error: Record<string, string>) {
  const event = {
    response: {
      error,
      id: "resp_failed",
      model: "test",
      object: "response",
      output: [],
      status: "failed",
    },
    type: "response.failed",
  };
  return new Response(`event: response.failed\ndata: ${JSON.stringify(event)}\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}
export function recoveringModel(response: () => Response | Promise<Response>) {
  const provider = createOpenAI({
    apiKey: "test",
    fetch: Object.assign(async () => response(), { preconnect: fetch.preconnect }),
  }).responses("gpt-6.1-sol");
  let attempts = 0;
  return new MockLanguageModelV4({
    doStream: async (options) => {
      if (attempts++ === 0) {
        return provider.doStream(options);
      }
      return {
        stream: simulateReadableStream({
          chunks: [
            { id: "answer", type: "text-start" },
            { delta: "recovered", id: "answer", type: "text-delta" },
            { id: "answer", type: "text-end" },
            {
              finishReason: { raw: undefined, unified: "stop" },
              type: "finish",
              usage: {
                inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
                outputTokens: { reasoning: 0, text: 1, total: 1 },
              },
            },
          ],
        }),
      };
    },
  });
}
