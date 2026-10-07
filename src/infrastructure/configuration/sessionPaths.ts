import { localize } from "../../i18n/server";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { userDataDirectory } from "./settings/files";

export function databasePath(storageDirectory = userDataDirectory()) {
  return resolve(storageDirectory, "omity.sqlite");
}
export function sessionPaths(sessionId: string, storageDirectory = userDataDirectory()) {
  const paths = resolveSessionPaths(sessionId, storageDirectory);
  mkdirSync(paths.dir, { recursive: true });
  return paths;
}
export function resolveSessionPaths(sessionId: string, storageDirectory = userDataDirectory()) {
  const dir = resolve(storageDirectory, "sessions", safeId(sessionId)),
    dbPath = databasePath(storageDirectory),
    userMessagesDir = resolve(dir, "user_messages"),
    tempDir = resolve(dir, "temp");
  return { dbPath, dir, tempDir, userMessagesDir };
}
export function safeId(value: string) {
  if (
    value.length === 0 ||
    value.length > 128 ||
    value === "." ||
    value === ".." ||
    !/^[a-zA-Z0-9._-]+$/.test(value)
  ) {
    throw new Error(localize("configuration:paths.idInvalid", { value0: value }));
  }
  return value;
}
