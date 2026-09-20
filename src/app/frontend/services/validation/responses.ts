import type { AttachmentSettings } from "../../../attachments/contract";
import { controlCommandSchema } from "../../../../types";
import { sessionInfoSchema } from "../../../events/contracts";
import { z } from ".";

export {
  reasoningTranslationSchema as reasoningTranslationResponseSchema,
  transcriptResponseSchema,
} from "../../../timeline/contracts/records";
export { streamEventSchema as eventSchema } from "../../../../types";
const integer = z.number().int(),
  attachmentSettingsSchema: z.ZodType<AttachmentSettings> = z.object({
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
      highConfidenceThreshold: z.number().min(0).max(1),
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
export const cleanupResponseSchema = z.object({ skipped: z.array(z.string()) });
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
