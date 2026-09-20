export const measuredCallId = "measured-noop";
const measuredToolName = "bench__noop0";
export function responseFrames(toolCall: boolean, model: string, inputTokens: number) {
  const call = {
      arguments: "{}",
      call_id: measuredCallId,
      id: "function-noop",
      name: measuredToolName,
      status: "completed",
      type: "function_call",
    },
    final = {
      content: [{ annotations: [], text: "done", type: "output_text" }],
      id: "final-message",
      role: "assistant",
      type: "message",
    },
    events = [
      {
        response: { created_at: 1, id: toolCall ? "tool-response" : "final-response", model },
        type: "response.created",
      },
      ...(toolCall
        ? [
            {
              item: { ...call, arguments: "" },
              output_index: 0,
              type: "response.output_item.added",
            },
            {
              delta: "{}",
              item_id: call.id,
              output_index: 0,
              type: "response.function_call_arguments.delta",
            },
            { item: call, output_index: 0, type: "response.output_item.done" },
          ]
        : [
            {
              item: { ...final, content: [] },
              output_index: 0,
              type: "response.output_item.added",
            },
            {
              content_index: 0,
              delta: "done",
              item_id: final.id,
              output_index: 0,
              type: "response.output_text.delta",
            },
            { item: final, output_index: 0, type: "response.output_item.done" },
          ]),
      {
        response: { usage: { input_tokens: inputTokens, output_tokens: 1 } },
        type: "response.completed",
      },
    ];
  return new TextEncoder().encode(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
  );
}
