import { controlSchema, queueStatusSchema, streamEventSchema } from "../../../types";
import { fileLinkUnitSchema, filePathMatchSchema } from "../../../fileLinks/types";
import { errorDetailsSchema } from "../../../failures/details";
import { z } from "zod";

const integer = z.number().int(),
  toolCallSchema = z.object({
    fileLinks: z.array(filePathMatchSchema).optional(),
    id: z.string(),
    index: integer.nonnegative(),
    input: z.unknown(),
    inputText: z.string().optional(),
    inputTokens: integer.nonnegative(),
    messageId: z.string().optional(),
    name: z.string(),
    rawInput: z.string().optional(),
    temporary: z.literal(true).optional(),
  }),
  tokenUsageSchema = z.object({
    cacheReadTokens: integer.nonnegative(),
    inputTokens: integer.nonnegative(),
    outputTokens: integer.nonnegative(),
  }),
  messageSchema = z.object({
    content: z.string(),
    createdAt: integer,
    id: integer.nonnegative(),
    images: z.array(z.object({ mimeType: z.string(), src: z.string() })),
    outputTokens: integer.nonnegative().optional(),
    queueId: integer.positive().nullable(),
    reasoning: z.string(),
    role: z.enum(["user", "system", "assistant", "tool"]),
    sourceId: z.string().optional(),
    toolCallId: z.string().optional(),
    toolCalls: z.array(toolCallSchema),
    usage: tokenUsageSchema.optional(),
  }),
  queueSchema = z.object({
    content: z.string(),
    error: errorDetailsSchema.nullable(),
    id: integer.positive(),
    root: z.boolean().optional(),
    status: queueStatusSchema,
    submissionId: z.string().nullable().optional(),
    userMessageId: integer.positive().nullable().optional(),
  });
export const reasoningTranslationSchema = z.object({
  messageId: z.string().min(1),
  source: z.string(),
  targetLanguage: z.string().min(1),
  translated: z.string(),
});
export const transcriptResponseSchema = z.object({
  control: controlSchema,
  eventCursor: integer.nonnegative(),
  events: z.array(streamEventSchema),
  fileLinks: z.array(fileLinkUnitSchema),
  messages: z.array(messageSchema),
  queue: z.array(queueSchema),
  reasoningTranslations: z.array(reasoningTranslationSchema),
  transcriptRevision: integer.nonnegative(),
});
export type DisplayMessage = z.infer<typeof messageSchema>;
export type DisplayQueue = z.infer<typeof queueSchema>;
export type DisplayToolCall = z.infer<typeof toolCallSchema>;
export type ReasoningTranslation = z.infer<typeof reasoningTranslationSchema>;
export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export type TranscriptSnapshot = z.infer<typeof transcriptResponseSchema>;
