import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export class UserMessageStorage {
  constructor(private readonly directory: string) {}
  append(content: string) {
    mkdirSync(this.directory, { recursive: true });
    for (let id = 0; ; id += 1) {
      const path = this.path(id);
      try {
        writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
        return path;
      } catch (error) {
        if (!isExistsError(error)) {
          throw error;
        }
      }
    }
  }
  writeAll(contents: readonly string[]) {
    mkdirSync(this.directory, { recursive: true });
    const paths: string[] = [];
    try {
      for (const [id, content] of contents.entries()) {
        const path = this.path(id);
        writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
        paths.push(path);
      }
    } catch (error) {
      for (const path of paths) {
        this.remove(path);
      }
      throw error;
    }
  }
  remove(path: string) {
    rmSync(path, { force: true });
  }
  private path(id: number) {
    return resolve(this.directory, `${id.toString()}.txt`);
  }
}
function isExistsError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
