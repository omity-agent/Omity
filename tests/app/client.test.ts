import { afterEach, expect, test } from "bun:test";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { cliParser } from "../../src/commandLine/parser";
import { createTestDirectory } from "../support/artifacts";
import { loadSettings } from "../../src/infrastructure/configuration/settings/load";
import { parseSync } from "@optique/core/parser";
import { rmSync } from "node:fs";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { setSessionControl } from "../../src/client";
import { writeTestConfiguration } from "../support/configuration";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("command line parser models commands as discriminated unions", () => {
  expect(parseValue(["host", "new", "123"])).toEqual({
    action: "new",
    sessionId: "123",
  });
  expect(parseValue(["client", "append", "123", "你好", "世界"])).toEqual({
    action: "append",
    message: ["你好", "世界"],
    sessionId: "123",
  });
  expect(parseValue(["client", "resume", "123"])).toEqual({
    action: "resume",
    sessionId: "123",
  });
});
test("command line parser rejects removed Oclif syntax", () => {
  expect(parseSync(cliParser, ["host", "123", "new"]).success).toBeFalse();
  expect(parseSync(cliParser, ["client", "123", "append=你好"]).success).toBeFalse();
});
test("client cancel during pause preserves pause state", () => {
  const { dbPath, root } = makeSession("123");
  const db = new AgentDatabase(dbPath);
  db.setControl("123", "pause");
  db.close();
  setSessionControl("123", "cancel", root);
  const reopened = new AgentDatabase(dbPath);
  expect(reopened.control("123")).toBe("pause_cancel");
  reopened.close();
});
function parseValue(args: string[]) {
  const result = parseSync(cliParser, args);
  if (!result.success) {
    throw new Error("命令解析失败");
  }
  return result.value;
}
function makeSession(sessionId: string) {
  const root = createTestDirectory("client");
  dirs.push(root);
  writeTestConfiguration(root);
  const paths = sessionPaths(loadSettings(root), sessionId);
  const db = new AgentDatabase(paths.dbPath);
  db.createSession(sessionId, root);
  db.close();
  return { dbPath: paths.dbPath, root };
}
