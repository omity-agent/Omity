import { DomainError, sessionNotFound } from "../../src/errors";
import { errorResponse, normalizeError } from "../../src/app/http/errors";
import { expect, spyOn, test } from "bun:test";

test("API maps domain errors to explicit status codes", () => {
  expect(normalizeError(sessionNotFound("123"))).toMatchObject({
    code: "SESSION_NOT_FOUND",
    status: 404,
  });
  expect(
    normalizeError(new DomainError("HOST_LEASE_CONFLICT", "会话已有 Host 正在运行：123")),
  ).toMatchObject({
    code: "HOST_LEASE_CONFLICT",
    status: 409,
  });
  expect(normalizeError(new Error("会话不存在：文案不再参与映射"))).toMatchObject({
    code: "INTERNAL_ERROR",
    message: "会话不存在：文案不再参与映射",
    status: 500,
  });
  expect(
    normalizeError(new DomainError("ATTACHMENT_TOO_LARGE", "附件总大小超过上限")),
  ).toMatchObject({ code: "ATTACHMENT_TOO_LARGE", status: 413 });
});
test("HTTP retryable model errors do not write raw provider responses to the terminal", () => {
  const log = spyOn(console, "error").mockReturnValue(undefined);
  errorResponse({
    error: {
      code: "server_error",
      message: "Our servers are currently overloaded. Please try again later.",
      type: "service_unavailable_error",
    },
    sequence_number: 2,
    type: "error",
  });
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});
