const upstreamFailure = {
    response: {
      error: { code: "upstream_error", message: "Upstream request failed" },
    },
    sequence_number: 0,
    type: "response.failed",
  },
  invalidFailure = {
    response: {
      error: { code: "invalid_request", message: "Invalid request" },
    },
    sequence_number: 0,
    type: "response.failed",
  },
  quotaFailure = {
    error: {
      message: "The usage limit has been reached",
      type: "usage_limit_reached",
    },
    sequence_number: 0,
    type: "error",
  };
export const generationFailures = [
  {
    errorName: "AI_StreamProviderError",
    expectedError: {
      details: {
        code: "upstream_error",
        data: upstreamFailure,
        isRetryable: true,
        statusCode: 500,
        type: "response.failed",
      },
      message: "Upstream request failed",
    },
    name: "a retryable upstream failure after partial output",
    response: () => partialFailure(upstreamFailure),
    retryable: true,
  },
  {
    errorName: "AI_StreamProviderError",
    expectedError: {
      details: { code: "invalid_request", isRetryable: false, statusCode: 400 },
    },
    name: "a non-retryable stream failure after partial output",
    response: () => partialFailure(invalidFailure),
    retryable: false,
  },
  {
    errorName: "AI_StreamProviderError",
    expectedError: {
      details: {
        data: quotaFailure,
        isRetryable: true,
        statusCode: 500,
        type: "usage_limit_reached",
      },
      message: "The usage limit has been reached",
    },
    name: "a usage limit overriding the SDK retryable flag after partial output",
    response: () => partialFailure(quotaFailure),
    retryable: false,
  },
];
function partialFailure(failure: Record<string, unknown>) {
  const events = [
    {
      response: { created_at: 1, id: "response-failed", model: "gpt-6.1-sol" },
      type: "response.created",
    },
    {
      item: { id: "message-failed", type: "message" },
      output_index: 0,
      type: "response.output_item.added",
    },
    {
      delta: "partial response",
      item_id: "message-failed",
      output_index: 0,
      type: "response.output_text.delta",
    },
    failure,
  ];
  return new Response(
    events
      .map((event) => `event: ${String(event["type"])}\ndata: ${JSON.stringify(event)}\n\n`)
      .join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}
