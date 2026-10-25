import { z } from "zod";

import {
  attachmentSettingsSchema,
  frontendSettingsSchema,
} from "../../infrastructure/configuration/settings/fieldSchemas";
import { controlCommandSchema } from "../../types";
import { sessionInfoSchema } from "../events/contracts";

export {
  reasoningTranslationSchema as reasoningTranslationResponseSchema,
  transcriptResponseSchema,
} from "../timeline/contracts/records";
const integer = z.number().int(),
  capabilitySchema = z.object({
    description: z.string().optional(),
    enable: z.boolean(),
    id: z.string().min(1),
  });
export const bootstrapResponseSchema = z.object({
  attachments: attachmentSettingsSchema,
  cwd: z.string(),
  frontend: frontendSettingsSchema,
  profiles: z.object({
    available: z.array(z.string()),
  }),
  sessions: z.array(sessionInfoSchema),
});
export const sessionOptionsSchema = z.object({
  hooks: z.array(capabilitySchema),
  mcpServers: z.array(capabilitySchema),
  model: z.string().min(1),
});
export const userMessagesResponseSchema = z.object({
  messages: z.array(z.object({ content: z.string(), createdAt: integer.nonnegative() })),
});
export const predictionsResponseSchema = z.object({
  predictions: z.array(z.string()),
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
export const messageResponseSchema = z.object({ content: z.string(), inputId: integer.positive() });
export const controlResponseSchema = z.object({
  control: controlCommandSchema,
});
export const toolCallResponseSchema = z.object({ toolCallId: z.string() });
export const activatedFileResponseSchema = z.object({ path: z.string() });
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
export type CapabilityOption = z.infer<typeof capabilitySchema>;
export type SessionOptions = z.infer<typeof sessionOptionsSchema>;
