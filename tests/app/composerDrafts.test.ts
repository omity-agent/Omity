import { afterEach, expect, test } from "bun:test";
import {
  clearSessionDraft,
  readSessionDraft,
  writeSessionDraft,
} from "../../src/app/composerDraft";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { basename } from "node:path";
import { createTestDirectory } from "../support/artifacts";
import { rmSync } from "node:fs";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});
test("session composer drafts survive database reopen", () => {
  const fixture = createSession();
  expect(writeSessionDraft(fixture.sessionId, "draft", 1)).toEqual({
    revision: 1,
  });
  expect(readSessionDraft(fixture.sessionId)).toEqual({
    content: "draft",
    revision: 1,
  });
});
test("stale saves cannot overwrite newer composer drafts", () => {
  const fixture = createSession();
  writeSessionDraft(fixture.sessionId, "newer", 2);
  writeSessionDraft(fixture.sessionId, "older", 1);
  expect(readSessionDraft(fixture.sessionId)).toEqual({
    content: "newer",
    revision: 2,
  });
});
test("sending clears only the composer revision it submitted", () => {
  const fixture = createSession();
  writeSessionDraft(fixture.sessionId, "submitted", 1);
  writeSessionDraft(fixture.sessionId, "next message", 2);
  clearSessionDraft(fixture.sessionId, 1);
  expect(readSessionDraft(fixture.sessionId).content).toBe("next message");
  clearSessionDraft(fixture.sessionId, 2);
  expect(readSessionDraft(fixture.sessionId)).toEqual({
    content: null,
    revision: 2,
  });
});
test("a late save cannot restore a draft after sending", () => {
  const fixture = createSession();
  clearSessionDraft(fixture.sessionId, 3);
  writeSessionDraft(fixture.sessionId, "stale", 3);
  expect(readSessionDraft(fixture.sessionId)).toEqual({
    content: null,
    revision: 3,
  });
  writeSessionDraft(fixture.sessionId, "next message", 4);
  expect(readSessionDraft(fixture.sessionId)).toEqual({
    content: "next message",
    revision: 4,
  });
});
function createSession() {
  const root = createTestDirectory("composer-drafts");
  dirs.push(root);
  const sessionId = basename(root),
    paths = sessionPaths(sessionId);
  dirs.push(paths.dir);
  const database = new AgentDatabase(paths.dbPath);
  database.createSession(sessionId, root);
  database.close();
  return { sessionId };
}
