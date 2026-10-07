import { localize } from "../../i18n/server";
import { z } from "zod";

const sessionPreparationSchema = z.strictObject({
  message: z.string(),
  pairs: z
    .array(
      z.strictObject({
        assistant: z.string(),
        id: z.string().regex(/^[0-9a-z]{8}$/u),
        user: z.string(),
      }),
    )
    .refine(
      (pairs) => new Set(pairs.map(({ id }) => id)).size === pairs.length,
      localize("application:composition.duplicateMessagePairId"),
    ),
});
export type SessionPreparation = z.infer<typeof sessionPreparationSchema>;
export type EditablePair = SessionPreparation["pairs"][number];
export function emptyPreparation(): SessionPreparation {
  return { message: "", pairs: [] };
}
export function parsePreparation(content: string): SessionPreparation {
  return sessionPreparationSchema.parse(JSON.parse(content));
}
export const preparationContentSchema = z.string().superRefine((content, context) => {
  try {
    parsePreparation(content);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: localize("application:composition.draftInvalid", {
        value0: error instanceof Error ? error.message : String(error),
      }),
    });
  }
});
