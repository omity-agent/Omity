import {
  controlCommandSchema,
  controlSchema,
  queueStatusSchema,
  sessionStatusSchema,
  streamEventSchema,
} from "../../../../types";
import { fileLinkUnitSchema, filePathMatchSchema } from "../../../../fileLinks/types";
import type { AttachmentSettings } from "../../../attachments/contract";
import type { SessionInfo } from "../../../sessionState";
import type { TranscriptSnapshot } from "../transcript/cache";
import { errorDetailsSchema } from "../../../../failures/details";
import { z } from ".";

const integer = z.number().int(),
  askUserQuestionSchema = z.discriminatedUnion("kind", [
    z.object({
      callId: z.string(),
      kind: z.literal("choice"),
      multiple: z.boolean(),
      options: z.array(z.string()),
      question: z.string(),
    }),
    z.object({
      callId: z.string(),
      kind: z.literal("open_ended"),
      question: z.string(),
    }),
  ]);
export const sessionInfoSchema: z.ZodType<SessionInfo> = z.object({
  askUser: askUserQuestionSchema.nullable().optional(),
  createdAt: integer,
  error: errorDetailsSchema.nullable(),
  id: z.string(),
  status: sessionStatusSchema,
  updatedAt: integer,
  workspace: z.string(),
});
const toolCallSchema = z.object({
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
  reasoningTranslationSchema = z.object({
    messageId: z.string().min(1),
    source: z.string(),
    targetLanguage: z.string().min(1),
    translated: z.string(),
  }),
  queueSchema = z.object({
    content: z.string(),
    error: errorDetailsSchema.nullable(),
    id: integer.positive(),
    root: z.boolean().optional(),
    status: queueStatusSchema,
    submissionId: z.string().nullable().optional(),
    userMessageId: integer.positive().nullable().optional(),
  }),
  eventSchema = streamEventSchema;
export { eventSchema };
export const transcriptResponseSchema: z.ZodType<TranscriptSnapshot> = z.object({
  control: controlSchema,
  eventCursor: integer.nonnegative(),
  events: z.array(eventSchema),
  fileLinks: z.array(fileLinkUnitSchema),
  messages: z.array(messageSchema),
  queue: z.array(queueSchema),
  reasoningTranslations: z.array(reasoningTranslationSchema),
  transcriptRevision: integer.nonnegative(),
});
const attachmentSettingsSchema: z.ZodType<AttachmentSettings> = z.object({
  allowedSuffixes: z.array(z.string()),
  maxSizeBytes: integer.nonnegative(),
});
export const bootstrapResponseSchema = z.object({
  attachments: attachmentSettingsSchema,
  cwd: z.string(),
  frontend: z.object({
    draftSaveDelayMs: integer.nonnegative(),
    reasoningTranslation: z.object({
      enabled: z.boolean(),
      minimumIntervalMs: integer.nonnegative(),
    }),
    transcriptSnapshotThrottleMs: integer.nonnegative(),
  }),
  profiles: z.object({
    available: z.array(z.string()),
  }),
  sessions: z.array(sessionInfoSchema),
});
export const sessionResponseSchema = z.object({ session: sessionInfoSchema });
export const deletedResponseSchema = z.object({ deleted: z.string() });
export const workspaceResponseSchema = z.object({ workspace: z.string().nullable() });
export const draftResponseSchema = z.object({
  content: z.string().nullable(),
  revision: integer.nonnegative(),
});
export const revisionResponseSchema = z.object({ revision: integer.nonnegative() });
export const messageResponseSchema = z.object({ content: z.string(), queueId: integer.positive() });
export const controlResponseSchema = z.object({
  control: controlCommandSchema,
});
export const cancellationResponseSchema = z.object({ toolCallId: z.string() });
export const answerResponseSchema = z.object({ toolCallId: z.string() });
export const reasoningTranslationResponseSchema = reasoningTranslationSchema;
