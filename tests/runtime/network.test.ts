import { expect, test } from "bun:test";
import { APICallError } from "@ai-sdk/provider";
import { isRetryableModelError } from "../../src/runtime/network";

test("recognizes retryable AI SDK API call errors", () => {
  const error = new APICallError({
    data: {
      error: {
        code: "server_is_overloaded",
      },
    },
    message: "Our servers are currently overloaded. Please try again later.",
    requestBodyValues: {},
    statusCode: 503,
    url: "https://www.cctq.ai/v1/responses",
  });
  expect(error.isRetryable).toBe(true);
  expect(isRetryableModelError(error)).toBe(true);
});
test("recognizes bad provider response statuses as retryable", () => {
  expect(
    isRetryableModelError({
      code: "bad_response_status_code",
      message: "openai_error (request id: xxxxxxxxx",
      param: "",
      type: "bad_response_status_code",
    }),
  ).toBe(true);
});
test("does not retry non-retryable AI SDK API call errors", () => {
  const error = new APICallError({
    message: "Invalid request",
    requestBodyValues: {},
    statusCode: 400,
    url: "https://www.cctq.ai/v1/responses",
  });
  expect(error.isRetryable).toBe(false);
  expect(isRetryableModelError(error)).toBe(false);
});
