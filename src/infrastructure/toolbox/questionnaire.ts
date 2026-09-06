import { z } from "zod";

const choiceQuestionSchema = z.object({
    multiple: z.boolean(),
    options: z.array(z.string()),
    question: z.string(),
  }),
  openQuestionSchema = choiceQuestionSchema.pick({ question: true });
export const askUserRequestSchema = z.discriminatedUnion("kind", [
  choiceQuestionSchema.extend({ callId: z.string(), kind: z.literal("choice") }),
  openQuestionSchema.extend({ callId: z.string(), kind: z.literal("open_ended") }),
]);
export type AskUserRequest = z.infer<typeof askUserRequestSchema>;
