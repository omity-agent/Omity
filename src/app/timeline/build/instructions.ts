import type { DisplayMessage } from "../contracts/projection";

export function prependInstructions(messages: DisplayMessage[], instructions?: string) {
  if (instructions === undefined || instructions.trim().length === 0) {
    return messages;
  }
  return [
    {
      content: instructions,
      createdAt: 0,
      id: 0,
      images: [],
      queueId: null,
      reasoning: "",
      role: "system" as const,
      toolCalls: [],
    },
    ...messages,
  ];
}
