import { resolve } from "node:path";

export function applicationAssetPath(root: string, sourcePath: string, embeddedPath = sourcePath) {
  return Reflect.get(Bun, "isStandaloneExecutable")
    ? resolve(import.meta.dir, embeddedPath)
    : resolve(root, sourcePath);
}
