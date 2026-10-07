import { type GeminiApi, eventStream } from "./endpointFixture";

const generateUsage = {
    cachedContentTokenCount: 3,
    candidatesTokenCount: 5,
    promptTokenCount: 10,
    thoughtsTokenCount: 2,
    totalTokenCount: 17,
  },
  interactionUsage = {
    total_cached_tokens: 3,
    total_input_tokens: 10,
    total_output_tokens: 5,
    total_thought_tokens: 2,
    total_tokens: 17,
  };
export function toolStream(api: GeminiApi) {
  if (api === "generate-content") {
    return eventStream([
      {
        candidates: [
          {
            content: {
              parts: [
                { text: "Need a tool", thought: true, thoughtSignature: "reasoning-signature" },
              ],
              role: "model",
            },
          },
        ],
        modelVersion: "gemini-3-flash-preview",
        responseId: "gemini-response",
      },
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { args: { text: "hello" }, id: "echo-call", name: "echo" },
                  thoughtSignature: "tool-signature",
                },
              ],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: generateUsage,
      },
    ]);
  }
  return eventStream([
    {
      event_type: "interaction.created",
      interaction: { model: "gemini-3-flash-preview", status: "in_progress" },
    },
    { event_type: "step.start", index: 0, step: { type: "thought" } },
    {
      delta: { content: { text: "Need a tool", type: "text" }, type: "thought_summary" },
      event_type: "step.delta",
      index: 0,
    },
    {
      delta: { signature: "reasoning-signature", type: "thought_signature" },
      event_type: "step.delta",
      index: 0,
    },
    { event_type: "step.stop", index: 0 },
    {
      event_type: "step.start",
      index: 1,
      step: { id: "echo-call", name: "echo", type: "function_call" },
    },
    {
      delta: { arguments: '{"text":', type: "arguments_delta" },
      event_type: "step.delta",
      index: 1,
    },
    {
      delta: { arguments: '"hello"}', signature: "tool-signature", type: "arguments_delta" },
      event_type: "step.delta",
      index: 1,
    },
    { event_type: "step.stop", index: 1 },
    {
      event_type: "interaction.completed",
      interaction: { status: "requires_action", usage: interactionUsage },
    },
  ]);
}
export function replyStream(api: GeminiApi, text = "Finished") {
  return api === "generate-content"
    ? eventStream([
        {
          candidates: [{ content: { parts: [{ text }], role: "model" }, finishReason: "STOP" }],
          usageMetadata: generateUsage,
        },
      ])
    : eventStream([
        { event_type: "interaction.created", interaction: { status: "in_progress" } },
        { event_type: "step.start", index: 0, step: { content: [], type: "model_output" } },
        { delta: { text, type: "text" }, event_type: "step.delta", index: 0 },
        { event_type: "step.stop", index: 0 },
        {
          event_type: "interaction.completed",
          interaction: { status: "completed", usage: interactionUsage },
        },
      ]);
}
export function structuredReply(api: GeminiApi) {
  const text = '{"reply":"predicted"}';
  return Response.json(
    api === "generate-content"
      ? {
          candidates: [{ content: { parts: [{ text }], role: "model" }, finishReason: "STOP" }],
          usageMetadata: generateUsage,
        }
      : {
          status: "completed",
          steps: [{ content: [{ text, type: "text" }], type: "model_output" }],
          usage: interactionUsage,
        },
  );
}
