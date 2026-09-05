import { controlCommandSchema, sessionStatusSchema } from "../../../../types";
import type { AttachmentSettings } from "../../../attachments/contract";
import type { SessionInfo } from "../../../sessionState";
import { errorDetailsSchema } from "../../../../failures/details";
import { z } from ".";

export {
  reasoningTranslationSchema as reasoningTranslationResponseSchema,
  transcriptResponseSchema,
} from "../../../timeline/contracts/records";
export { streamEventSchema as eventSchema } from "../../../../types";
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
