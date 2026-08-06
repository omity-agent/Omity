import type { ErrorDetails } from "../../../../failures/details";
import { z } from ".";

export const errorDetailsSchema: z.ZodType<ErrorDetails> = z.lazy(() =>
  z.object({
    cause: errorDetailsSchema.optional(),
    details: z.record(z.string(), z.json()).optional(),
    message: z.string(),
    name: z.string(),
    stack: z.string().optional(),
  }),
);
