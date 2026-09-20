import { askUserRequestSchema } from "../../infrastructure/toolbox/questionnaire";
import { errorDetailsSchema } from "../../failures/details";
import { sessionStatusSchema } from "../../types";
import { z } from "zod";

export const sessionInfoSchema = z.object({
  askUser: askUserRequestSchema.nullable().optional(),
  createdAt: z.number().int(),
  error: errorDetailsSchema.nullable(),
  id: z.string(),
  status: sessionStatusSchema,
  title: z.string(),
  updatedAt: z.number().int(),
  workspace: z.string(),
});
export const warningEventSchema = z.object({
  code: z.literal("model_api_unavailable"),
  details: z.object({
    attempt: z.number().int().positive(),
    delayMs: z.number().int().positive(),
    error: errorDetailsSchema,
    queueId: z.number().int().positive(),
    sessionId: z.string().min(1),
  }),
  message: z.string().min(1),
});
export const sessionsEventSchema = z.object({ sessions: z.array(sessionInfoSchema) });
export const deletedEventSchema = z.object({ sessionId: z.string() });
export const syncEventSchema = z.object({ eventCursor: z.number().int().nonnegative() });
export type SessionInfo = z.infer<typeof sessionInfoSchema>;
export type BrowserWarning = z.infer<typeof warningEventSchema>;
