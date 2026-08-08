import type { FilePathMatch } from "../../../fileLinks/types";
import { z } from ".";

const filePathMatchSchema: z.ZodType<FilePathMatch> = z.object({
  kind: z.enum(["directory", "file"]),
  path: z.string(),
  position: z.object({
    end: z.number().int().nonnegative(),
    start: z.number().int().nonnegative(),
  }),
});
export const fileLinkMatchesSchema = z.object({
  matches: z.array(filePathMatchSchema),
});
export const fileLinkActionSchema = z.object({ path: z.string() });
