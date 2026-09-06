import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { clearAgentTemporaryFiles } from "../../../src/app/runtime/temporaryFiles";
import filesystem from "node:fs/promises";
import { join } from "node:path";
import { sessionPaths } from "../../../src/infrastructure/configuration/sessionPaths";

const paths = sessionPaths("cleanup-files");
let warning: ReturnType<typeof spyOn<typeof console, "warn">>;
beforeEach(() => {
  warning = spyOn(console, "warn").mockReturnValue(undefined);
});
afterEach(() => {
  rmSync(paths.dir, { force: true, recursive: true });
  warning.mockRestore();
});
test("cleanup removes nested temporary files while preserving session data and the directory", async () => {
  mkdirSync(join(paths.tempDir, "nested"), { recursive: true });
  writeFileSync(join(paths.tempDir, "nested", "result.txt"), "temporary");
  writeFileSync(join(paths.tempDir, "scratch.txt"), "temporary");
  writeFileSync(paths.dbPath, "session");
  mkdirSync(paths.userMessagesDir);
  writeFileSync(join(paths.userMessagesDir, "input.txt"), "keep");
  expect(await clearAgentTemporaryFiles("cleanup-files")).toEqual({ skipped: [] });
  expect(readdirSync(paths.tempDir)).toEqual([]);
  expect(readFileSync(paths.dbPath, "utf8")).toBe("session");
  expect(readFileSync(join(paths.userMessagesDir, "input.txt"), "utf8")).toBe("keep");
  expect(await clearAgentTemporaryFiles("cleanup-files")).toEqual({ skipped: [] });
});
test("cleanup creates an absent temporary directory", async () => {
  expect(await clearAgentTemporaryFiles("cleanup-files")).toEqual({ skipped: [] });
  expect(readdirSync(paths.tempDir)).toEqual([]);
});
test("cleanup skips a locked file and still removes its siblings", async () => {
  mkdirSync(join(paths.tempDir, "nested"), { recursive: true });
  const locked = join(paths.tempDir, "nested", "locked.txt"),
    removable = join(paths.tempDir, "nested", "removable.txt"),
    outside = join(paths.tempDir, "other.txt"),
    original = filesystem.unlink;
  for (const path of [locked, removable, outside]) {
    writeFileSync(path, "test");
  }
  const unlink = spyOn(filesystem, "unlink").mockImplementation((path) =>
    path === locked
      ? Promise.reject(Object.assign(new Error("File is in use"), { code: "EBUSY" }))
      : original(path),
  );
  try {
    expect(await clearAgentTemporaryFiles("cleanup-files")).toEqual({ skipped: [locked] });
    expect(existsSync(locked)).toBe(true);
    expect(existsSync(removable)).toBe(false);
    expect(existsSync(outside)).toBe(false);
    expect(warning).toHaveBeenCalledWith(expect.any(String), locked, expect.any(Error));
  } finally {
    unlink.mockRestore();
  }
});
test("cleanup does not traverse directory links or a redirected temporary root", async () => {
  mkdirSync(paths.userMessagesDir, { recursive: true });
  writeFileSync(join(paths.userMessagesDir, "keep.txt"), "keep");
  mkdirSync(paths.tempDir);
  symlinkSync(paths.userMessagesDir, join(paths.tempDir, "linked"), "junction");
  expect(await clearAgentTemporaryFiles("cleanup-files")).toEqual({ skipped: [] });
  expect(readFileSync(join(paths.userMessagesDir, "keep.txt"), "utf8")).toBe("keep");
  rmSync(paths.tempDir, { recursive: true });
  symlinkSync(paths.userMessagesDir, paths.tempDir, "junction");
  expect(await clearAgentTemporaryFiles("cleanup-files")).toEqual({ skipped: [paths.tempDir] });
  expect(readFileSync(join(paths.userMessagesDir, "keep.txt"), "utf8")).toBe("keep");
  expect(warning).toHaveBeenCalled();
});
