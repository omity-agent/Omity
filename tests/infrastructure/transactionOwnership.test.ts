import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDatabases, required, workspace } from "../support/database";
import { runTransaction } from "../../src/infrastructure/database/sqlite/connection";

afterEach(cleanupDatabaseDirs);
test("independent SQLite connections enforce lease takeover, input claims and rollback boundaries", () => {
  const databases = makeDatabases(2);
  using owner = required(databases[0]),
    contender = required(databases[1]);
  owner.createSession("session", workspace);
  expect(
    owner.acquireHostLease({ now: 1000, ownerId: "first", sessionId: "session", ttlMs: 100 }),
  ).toBe(true);
  expect(
    contender.acquireHostLease({ now: 1050, ownerId: "second", sessionId: "session", ttlMs: 100 }),
  ).toBe(false);
  expect(
    contender.renewHostLease({ now: 1050, ownerId: "second", sessionId: "session", ttlMs: 100 }),
  ).toBe(false);
  expect(
    contender.acquireHostLease({ now: 1101, ownerId: "second", sessionId: "session", ttlMs: 100 }),
  ).toBe(true);
  expect(owner.releaseHostLease("session", "first")).toBe(false);
  expect(contender.releaseHostLease("session", "second")).toBe(true);

  owner.submitUser("session", "once", 0, "a1b2c3d4");
  expect(() => contender.submitUser("session", "duplicate", 0, "a1b2c3d4")).toThrow("UNIQUE");
  const stale = required(contender.nextInput("session"));
  owner.consumeInput("session", required(owner.nextInput("session")));
  expect(() => contender.consumeInput("session", stale)).toThrow("输入认领冲突");
  expect(contender.history("session").map(({ text }) => text)).toEqual(["once"]);

  runTransaction(owner.db, () => {
    owner.createSession("committed", workspace);
    expect(contender.hasSession("committed")).toBe(false);
    expect(() =>
      runTransaction(owner.db, () => {
        owner.createSession("rolled-back", workspace);
        throw new Error("nested failure");
      }),
    ).toThrow("nested failure");
  });
  expect(contender.hasSession("committed")).toBe(true);
  expect(contender.hasSession("rolled-back")).toBe(false);
  expect(contender.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
});
