export type FileLinkAction = "open" | "reveal";
export type FilePathKind = "directory" | "file";
export interface FilePathMatch {
  kind: FilePathKind;
  path: string;
  position: {
    end: number;
    start: number;
  };
}
