import filesystem from "node:fs/promises";
import { join } from "node:path";
import { resolveSessionPaths } from "../../infrastructure/configuration/sessionPaths";

export async function clearAgentTemporaryFiles(sessionId: string) {
  const { tempDir } = resolveSessionPaths(sessionId),
    skipped: string[] = [],
    warn = (path: string, error: unknown) => {
      skipped.push(path);
      console.warn("清空 Agent 临时目录时跳过无法删除的项目：", path, error);
    },
    removeEntry = async (path: string): Promise<boolean> => {
      try {
        const entry = await filesystem.lstat(path);
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          if (!(await clearDirectory(path))) {
            return false;
          }
          await filesystem.rmdir(path);
        } else {
          await filesystem.unlink(path);
        }
        return true;
      } catch (error) {
        warn(path, error);
        return false;
      }
    },
    clearDirectory = async (path: string) => {
      const entries = await filesystem.readdir(path);
      let complete = true;
      for (const name of entries) {
        if (!(await removeEntry(join(path, name)))) {
          complete = false;
        }
      }
      return complete;
    };
  try {
    await filesystem.mkdir(tempDir, { recursive: true });
    const root = await filesystem.lstat(tempDir);
    if (root.isSymbolicLink() || !root.isDirectory()) {
      throw new Error("Agent 临时目录必须是实际目录，不能是符号链接");
    }
    await clearDirectory(tempDir);
  } catch (error) {
    warn(tempDir, error);
  }
  return { skipped };
}
