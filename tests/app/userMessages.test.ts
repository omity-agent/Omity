import { afterEach, expect, test } from "bun:test";
import { appendSessionMessage, submitSessionMessage } from "../../src/client";
import {
  createSessionStorage,
  forkSessionStorage,
  removeSessionStorage,
} from "../../src/app/runtime/sessionStorage";
import { readFileSync, readdirSync } from "node:fs";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { randomUUID } from "node:crypto";
import { resolveSessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { workspace } from "../support/database";

const sessions: string[] = [];
afterEach(() => {
  for (const sessionId of sessions.splice(0)) {
    removeSessionStorage(sessionId);
  }
});
test("new multi-turn sessions save user messages with zero-based IDs", () => {
  const sessionId = session();
  createSessionStorage(
    sessionId,
    workspace,
    [],
    [
      { assistant: "第一条回复", user: "第一条" },
      { assistant: "第二条回复", user: "第二条" },
    ],
    "第三条",
  );
  submitSessionMessage(sessionId, "第四条", 0, "submission-4");
  expect(readUserMessages(sessionId)).toEqual(["第一条", "第二条", "第三条", "第四条"]);
});
test("forks copy inherited user messages and save their edited draft when submitted", () => {
  const sourceSessionId = session(),
    targetSessionId = session();
  createSessionStorage(
    sourceSessionId,
    workspace,
    [],
    [
      { assistant: "第一条回复", user: "第一条" },
      { assistant: "第二条回复", user: "第二条" },
    ],
    "Fork 草稿",
  );
  const sourcePaths = resolveSessionPaths(sourceSessionId),
    source = new AgentDatabase(sourcePaths.dbPath);
  source.startQueue(sourceSessionId, required(source.nextQueue(sourceSessionId)));
  const forkPoint = required(
    source.db.query<{ id: number }, []>("SELECT id FROM messages ORDER BY id DESC LIMIT 1").get(),
  );
  source.close();
  forkSessionStorage({
    beforeMessageId: forkPoint.id,
    profiles: [],
    sourceSessionId,
    targetSessionId,
    workspace,
  });
  expect(readUserMessages(targetSessionId)).toEqual(["第一条", "第二条"]);
  appendSessionMessage(targetSessionId, "编辑后的第三条");
  expect(readUserMessages(targetSessionId)).toEqual(["第一条", "第二条", "编辑后的第三条"]);
});
function session() {
  const sessionId = randomUUID();
  sessions.push(sessionId);
  return sessionId;
}
function readUserMessages(sessionId: string) {
  const directory = resolveSessionPaths(sessionId).userMessagesDir;
  return readdirSync(directory)
    .toSorted((left, right) => Number.parseInt(left) - Number.parseInt(right))
    .map((file) => readFileSync(`${directory}/${file}`, "utf8"));
}
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("测试所需值不存在");
  }
  return value;
}
