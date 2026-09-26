import { emptyAs } from "../configuration/settings/values";
import { z } from "zod";

const description = emptyAs(z.string(), ""),
  count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  parameter = z.strictObject({ description, minLength: count }),
  metadata = z.strictObject({
    defer_loading: z.boolean().optional(),
    description,
    enabled: z.boolean(),
    name: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/u)
      .refine((name) => name !== "agent"),
  }),
  choicePreferences = metadata.extend({
    parameters: z.strictObject({
      multiple: z.strictObject({ description }),
      options: parameter.extend({ itemDescription: description, minItems: count }),
      question: parameter,
    }),
  }),
  openPreferences = metadata.extend({
    parameters: z.strictObject({ question: parameter }),
  }),
  titlePreferences = metadata.extend({
    errors: z.strictObject({
      invalidLength: z.string().min(1),
    }),
    parameters: z.strictObject({
      title: parameter
        .extend({ maxLength: count, minLength: count.min(1) })
        .refine(({ minLength, maxLength }) => minLength <= maxLength, { path: ["maxLength"] }),
    }),
  });
export const builtInPreferencesSchema = z.strictObject({
  choice: emptyAs(choicePreferences.optional(), undefined).optional(),
  open_ended: emptyAs(openPreferences.optional(), undefined).optional(),
  update_title: emptyAs(titlePreferences.optional(), undefined).optional(),
});
export type BuiltInPreferences = z.infer<typeof builtInPreferencesSchema>;
