import { z } from "zod";

export const settingsProfileNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
export const settingsProfileNamesSchema = z
  .array(settingsProfileNameSchema)
  .refine((names) => new Set(names).size === names.length, "Profile 列表不能包含重复项");
