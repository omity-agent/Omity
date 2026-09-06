import { type StructuredToolInterface, type ToolRunnableConfig, tool } from "@langchain/core/tools";
import type { AskUserRequest } from "./questionnaire";
import type { BuiltInPreferences } from "./metadata";
import { z } from "zod";

export type { AskUserRequest } from "./questionnaire";
type AskUserHandler = (request: AskUserRequest, config: ToolRunnableConfig) => Promise<unknown>;
export function createAskUserTools(settings: BuiltInPreferences, handler: AskUserHandler) {
  const tools: StructuredToolInterface[] = [],
    { choice } = settings,
    open = settings.open_ended;
  if (choice?.enabled) {
    const { multiple, options, question } = choice.parameters;
    tools.push(
      tool(
        async (input, config) =>
          JSON.stringify(
            await handler({ ...input, callId: requireToolCallId(config), kind: "choice" }, config),
          ),
        {
          description: choice.description,
          name: choice.name,
          schema: z.strictObject({
            multiple: z.boolean().describe(multiple.description),
            options: z
              .array(z.string().min(options.minLength).describe(options.itemDescription))
              .min(options.minItems)
              .describe(options.description),
            question: z.string().min(question.minLength).describe(question.description),
          }),
        },
      ),
    );
  }
  if (open?.enabled) {
    const { question } = open.parameters;
    tools.push(
      tool(
        async (input, config) =>
          JSON.stringify(
            await handler(
              { ...input, callId: requireToolCallId(config), kind: "open_ended" },
              config,
            ),
          ),
        {
          description: open.description,
          name: open.name,
          schema: z.strictObject({
            question: z.string().min(question.minLength).describe(question.description),
          }),
        },
      ),
    );
  }
  return tools;
}
function requireToolCallId(config: ToolRunnableConfig) {
  const id = config.toolCall?.id;
  if (!id) {
    throw new Error("ask_user 工具缺少工具调用 ID");
  }
  return id;
}
