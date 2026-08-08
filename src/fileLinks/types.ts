export type FileLinkAction = "open" | "reveal";
export type FileLinkSurface = "content" | "reasoning" | "tool_input" | "tool_output";
export type FilePathKind = "directory" | "file";
export interface FilePathMatch {
  kind: FilePathKind;
  path: string;
  position: {
    end: number;
    start: number;
  };
}
export interface FileLinkUnit {
  end: number;
  matches: FilePathMatch[];
  ownerId: string;
  start: number;
  surface: FileLinkSurface;
  unitIndex: number;
}
