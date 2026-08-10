import { type ToolRunnableConfig, tool } from "@langchain/core/tools";
import { z } from "zod";

export const askUserChoiceSchema = z.object({
  multiple: z.boolean(),
  options: z.array(z.string().min(1)),
  question: z.string().min(1),
});
export const askUserOpenEndedSchema = z.object({
  question: z.string().min(1),
});
export type AskUserChoiceRequest = z.infer<typeof askUserChoiceSchema> & {
  callId: string;
  kind: "choice";
};
export type AskUserOpenEndedRequest = z.infer<typeof askUserOpenEndedSchema> & {
  callId: string;
  kind: "open_ended";
};
export type AskUserRequest = AskUserChoiceRequest | AskUserOpenEndedRequest;
export type AskUserHandler = (
  request: AskUserRequest,
  config: ToolRunnableConfig,
) => Promise<unknown>;
export function createAskUserTools(handler: AskUserHandler) {
  return [
    tool(
      async (input, config) =>
        JSON.stringify(
          await handler({ ...input, callId: requireToolCallId(config), kind: "choice" }, config),
        ),
      {
        name: "ask_user__choice",
        schema: askUserChoiceSchema,
      },
    ),
    tool(
      async (input, config) =>
        JSON.stringify(
          await handler(
            { ...input, callId: requireToolCallId(config), kind: "open_ended" },
            config,
          ),
        ),
      {
        name: "ask_user__open_ended",
        schema: askUserOpenEndedSchema,
      },
    ),
  ];
}
function requireToolCallId(config: ToolRunnableConfig) {
  const id = config.toolCall?.id;
  if (!id) {
    throw new Error("ask_user 工具缺少工具调用 ID");
  }
  return id;
}
