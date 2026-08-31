import { z } from "zod";

const offsetSchema = z.number().int().nonnegative(),
  positionSchema = z.object({
    end: offsetSchema,
    start: offsetSchema,
  });
export const fileLinkActionSchema = z.enum(["open", "reveal"]);
const fileLinkSurfaceSchema = z.enum(["content", "reasoning", "tool_input", "tool_output"]),
  filePathKindSchema = z.enum(["directory", "file"]);
export const filePathMatchSchema = z.object({
  kind: filePathKindSchema,
  path: z.string(),
  position: positionSchema,
});
export const fileLinkUnitSchema = z.object({
  end: offsetSchema,
  matches: z.array(filePathMatchSchema),
  ownerId: z.string(),
  start: offsetSchema,
  surface: fileLinkSurfaceSchema,
  unitIndex: offsetSchema,
});
export type FileLinkAction = z.infer<typeof fileLinkActionSchema>;
export type FileLinkSurface = z.infer<typeof fileLinkSurfaceSchema>;
export type FilePathKind = z.infer<typeof filePathKindSchema>;
export type FilePathMatch = z.infer<typeof filePathMatchSchema>;
export type FileLinkUnit = z.infer<typeof fileLinkUnitSchema>;
