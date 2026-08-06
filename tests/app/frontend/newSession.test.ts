import { expect, test } from "bun:test";
import { resolveNewSessionWorkspace } from "../../../src/app/frontend/services/newSession";

test("new sessions inherit the workspace of the source session", () => {
  expect(resolveNewSessionWorkspace("F:/workspace/source", "F:/workspace/server")).toBe(
    "F:/workspace/source",
  );
});
test("new sessions use the server workspace without a source session", () => {
  expect(resolveNewSessionWorkspace(undefined, "F:/workspace/server")).toBe("F:/workspace/server");
});
