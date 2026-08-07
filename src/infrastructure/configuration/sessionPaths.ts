import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { userDataDirectory } from "./settings/files";

export function sessionPaths(sessionId: string, storageDirectory = userDataDirectory()) {
  const paths = resolveSessionPaths(sessionId, storageDirectory);
  mkdirSync(paths.dir, { recursive: true });
  return paths;
}
export function resolveSessionPaths(sessionId: string, storageDirectory = userDataDirectory()) {
  const dir = resolve(storageDirectory, "sessions", safeId(sessionId));
  const dbPath = resolve(dir, "agent.sqlite");
  return { dbPath, dir };
}
export function safeId(value: string) {
  if (
    value.length === 0 ||
    value.length > 128 ||
    value === "." ||
    value === ".." ||
    !/^[a-zA-Z0-9._-]+$/.test(value)
  ) {
    throw new Error(`路径 ID 无效：${value}`);
  }
  return value;
}
