import { MAX_LEVEL, findExistingPaths } from "pathprobe";
import type { FilePathMatch } from "./types";

const searchLevel = MAX_LEVEL - 1;
export async function probeFileLinks(text: string, workspace: string): Promise<FilePathMatch[]> {
  return findExistingPaths(text, searchLevel, [workspace], undefined, false, true);
}
