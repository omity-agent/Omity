import type { AttachmentSettings } from "../../../attachments/contract";
import type { DisplayEvent } from "../../../timeline";
import type { FileLinkUnit } from "../../../../fileLinks/types";
import type { SessionInfo } from "../../../sessionState";
import type { TranscriptSnapshot } from "../transcript/cache";
import { errorDetailsSchema } from "./errors";
import { z } from ".";

const integer = z.number().int();
const fileLinkMatchSchema = z.object({
  kind: z.enum(["directory", "file"]),
  path: z.string(),
  position: z.object({
    end: integer.nonnegative(),
    start: integer.nonnegative(),
  }),
});
const fileLinkUnitSchema: z.ZodType<FileLinkUnit> = z.object({
  end: integer.nonnegative(),
  matches: z.array(fileLinkMatchSchema),
  ownerId: z.string(),
  start: integer.nonnegative(),
  surface: z.enum(["content", "reasoning", "tool_input", "tool_output"]),
  unitIndex: integer.nonnegative(),
});
const sessionInfoSchema: z.ZodType<SessionInfo> = z.object({
  createdAt: integer,
  error: errorDetailsSchema.nullable(),
  id: z.string(),
  status: z.enum(["tool", "model", "idle", "pausing", "paused", "error"]),
  updatedAt: integer,
  workspace: z.string(),
});
const toolCallSchema = z.object({
  fileLinks: z.array(fileLinkMatchSchema).optional(),
  id: z.string(),
  index: integer.nonnegative(),
  input: z.unknown(),
  inputText: z.string().optional(),
  inputTokens: integer.nonnegative(),
  messageId: z.string().optional(),
  name: z.string(),
  rawInput: z.string().optional(),
  temporary: z.literal(true).optional(),
});
const tokenUsageSchema = z.object({
  cacheReadTokens: integer.nonnegative(),
  inputTokens: integer.nonnegative(),
  outputTokens: integer.nonnegative(),
});
const messageSchema = z.object({
  content: z.string(),
  createdAt: integer,
  id: integer.positive(),
  images: z.array(z.object({ mimeType: z.string(), src: z.string() })),
  outputTokens: integer.nonnegative().optional(),
  queueId: integer.positive().nullable(),
  reasoning: z.string(),
  role: z.enum(["user", "assistant", "tool"]),
  sourceId: z.string().optional(),
  toolCallId: z.string().optional(),
  toolCalls: z.array(toolCallSchema),
  usage: tokenUsageSchema.optional(),
});
const queueSchema = z.object({
  content: z.string(),
  error: errorDetailsSchema.nullable(),
  id: integer.positive(),
  root: z.boolean().optional(),
  status: z.enum(["draft", "pending", "running", "paused", "done", "canceled"]),
  userMessageId: integer.positive().nullable().optional(),
});
const eventSchema: z.ZodType<DisplayEvent> = z.discriminatedUnion("kind", [
  z.object({
    fileLinks: z.array(fileLinkUnitSchema).optional(),
    id: integer.positive(),
    kind: z.enum(["assistant_reasoning_delta", "assistant_text_delta"]),
    messageId: z.string().min(1),
    partId: z.string().min(1),
    queueId: integer.positive(),
    value: z.string(),
  }),
  z.object({
    fileLinks: z.array(fileLinkUnitSchema).optional(),
    id: integer.positive(),
    kind: z.literal("tool_call_delta"),
    messageId: z.string().min(1),
    partId: z.string().min(1),
    queueId: integer.positive(),
    value: z.object({
      argumentsDelta: z.string().optional(),
      freeform: z.boolean().optional(),
      idDelta: z.string().optional(),
      index: integer.nonnegative(),
      nameDelta: z.string().optional(),
    }),
  }),
  z.object({
    fileLinks: z.array(fileLinkUnitSchema).optional(),
    id: integer.positive(),
    kind: z.literal("tool_finished"),
    messageId: z.string().min(1),
    partId: z.string().min(1),
    queueId: integer.positive(),
    value: z.object({
      callId: z.string().min(1),
      output: z.object({
        content: z.string(),
        images: z.array(z.object({ mimeType: z.string(), src: z.string() })),
        outputTokens: integer.nonnegative().optional(),
      }),
    }),
  }),
  z.object({
    fileLinks: z.array(fileLinkUnitSchema).optional(),
    id: integer.positive(),
    kind: z.literal("tool_started"),
    messageId: z.string().min(1),
    partId: z.string().min(1),
    queueId: integer.positive(),
    value: z.string().min(1),
  }),
  z.object({
    fileLinks: z.array(fileLinkUnitSchema).optional(),
    id: integer.positive(),
    kind: z.literal("user_appended"),
    messageId: z.string().min(1),
    partId: z.literal("user"),
    queueId: integer.positive(),
    value: z.null(),
  }),
]);
export const transcriptResponseSchema: z.ZodType<TranscriptSnapshot> = z.object({
  control: z.enum(["running", "step", "pause", "cancel", "pause_cancel"]),
  eventCursor: integer.nonnegative(),
  events: z.array(eventSchema),
  fileLinks: z.array(fileLinkUnitSchema),
  messages: z.array(messageSchema),
  queue: z.array(queueSchema),
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
    transcriptRefreshIntervalMs: integer.nonnegative(),
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
  control: z.enum(["running", "step", "pause", "cancel"]),
});
export const cancellationResponseSchema = z.object({ toolCallId: z.string() });
