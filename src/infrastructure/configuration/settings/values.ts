import { z } from "zod";

export function emptyAs<T extends z.ZodType>(schema: T, empty: z.output<T>) {
  return z
    .union([schema, z.null(), z.literal("")])
    .transform((value) => (value === null || value === "" ? structuredClone(empty) : value));
}
