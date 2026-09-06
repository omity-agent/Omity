import { z } from "zod";

const content = z.union([
    z.string(),
    z.array(z.looseObject({ id: z.string().optional(), type: z.string() })),
  ]),
  tokens = z.number().int().nonnegative(),
  usage = z
    .strictObject({ cacheRead: tokens, input: tokens, output: tokens })
    .refine(
      ({ input, output }) => Number.isSafeInteger(input + output),
      "消息总 token 数超出安全整数范围",
    ),
  toolCall = z.strictObject({
    args: z.record(z.string(), z.unknown()),
    id: z.string().optional(),
    isCustomTool: z.boolean().optional(),
    name: z.string(),
    type: z.literal("tool_call"),
  }),
  human = z.strictObject({ content, type: z.literal("human") }),
  ai = z.strictObject({
    aiSdkContent: z.unknown().optional(),
    content,
    reasoning: z.record(z.string(), z.unknown()).optional(),
    toolCalls: z.array(toolCall).optional(),
    type: z.literal("ai"),
    usage: usage.optional(),
  }),
  tool = z.strictObject({
    content,
    custom: z.boolean().optional(),
    largeOutputTokens: tokens.optional(),
    name: z.string().optional(),
    structuredOutput: z.unknown().optional(),
    toolCallId: z.string(),
    type: z.literal("tool"),
  });
export const storedConversationSchema = z.discriminatedUnion("type", [human, ai, tool]);
export type StoredConversationMessage = z.infer<typeof storedConversationSchema>;
export type StoredAi = z.infer<typeof ai>;
export type StoredTool = z.infer<typeof tool>;
export type StoredUsage = z.infer<typeof usage>;
