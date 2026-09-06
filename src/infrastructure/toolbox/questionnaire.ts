import { z } from "zod";

export const choiceQuestionSchema = z.object({
    multiple: z.boolean(),
    options: z.array(z.string().min(1)),
    question: z.string().min(1),
  }),
  openQuestionSchema = choiceQuestionSchema.pick({ question: true }),
  askUserRequestSchema = z.discriminatedUnion("kind", [
    choiceQuestionSchema.extend({ callId: z.string(), kind: z.literal("choice") }),
    openQuestionSchema.extend({ callId: z.string(), kind: z.literal("open_ended") }),
  ]);
export type AskUserRequest = z.infer<typeof askUserRequestSchema>;
