import { type AskUserRequest, choiceQuestionSchema, openQuestionSchema } from "./questionnaire";
import { type ToolRunnableConfig, tool } from "@langchain/core/tools";

export type { AskUserRequest } from "./questionnaire";
type AskUserHandler = (request: AskUserRequest, config: ToolRunnableConfig) => Promise<unknown>;
export function createAskUserTools(handler: AskUserHandler) {
  return [
    tool(
      async (input, config) =>
        JSON.stringify(
          await handler({ ...input, callId: requireToolCallId(config), kind: "choice" }, config),
        ),
      {
        name: "ask_user__choice",
        schema: choiceQuestionSchema,
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
        schema: openQuestionSchema,
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
