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
test("recognizes unknown certificate verification errors as retryable", () => {
  const error = Object.assign(new TypeError("unknown certificate verification error"), {
    code: "UNKNOWN_CERTIFICATE_VERIFICATION_ERROR",
    errno: 0,
    path: "xxx",
  });
  expect(isRetryableModelError(error)).toBe(true);
});
test.each(["cause", "error", "details"])(
  "recognizes unknown certificate verification errors nested in %s",
  (key) => {
    expect(
      isRetryableModelError({
        [key]: { code: "UNKNOWN_CERTIFICATE_VERIFICATION_ERROR" },
      }),
    ).toBe(true);
  },
);
test("recognizes serialized session certificate verification errors as retryable", () => {
  expect(
    isRetryableModelError({
      error: {
        details: {
          code: "UNKNOWN_CERTIFICATE_VERIFICATION_ERROR",
          errno: 0,
          path: "xxx",
        },
        message: "unknown certificate verification error",
        name: "TypeError",
      },
      sessionId: "xxx",
    }),
  ).toBe(true);
});
test("does not retry certificate verification errors based only on their message", () => {
  expect(isRetryableModelError(new TypeError("unknown certificate verification error"))).toBe(
    false,
  );
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
