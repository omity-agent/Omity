import { z } from "zod";

export const settingsProfileNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
export const settingsProfileNamesSchema = z
  .array(settingsProfileNameSchema)
  .superRefine((names, context) => {
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: "custom",
        message: "Profile 列表不能包含重复项",
      });
    }
  });
