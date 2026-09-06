import { expect, test } from "bun:test";
import {
  pageFromHash,
  pagePath,
  pageSessionId,
  resolvePage,
} from "../../../src/app/frontend/route";

test("hash routes preserve page state without depending on the document path", () => {
  expect(pageFromHash("#/new")).toEqual({ kind: "new" });
  expect(pageFromHash("#/sessions/session%20id")).toEqual({
    id: "session id",
    kind: "session",
  });
  expect(pageFromHash("#/fork/source%20id/42")).toEqual({
    beforeMessageId: 42,
    kind: "fork",
    sourceSessionId: "source id",
  });
  expect(pageFromHash("#/fork/source/0")).toEqual({ kind: "new" });
  expect(pageFromHash("")).toEqual({ kind: "new" });
  expect(pagePath({ id: "session id", kind: "session" })).toBe("#/sessions/session%20id");
  expect(
    pagePath({
      beforeMessageId: 42,
      kind: "fork",
      sourceSessionId: "source id",
    }),
  ).toBe("#/fork/source%20id/42");
});
test.each([
  ["#/sessions/session%20id", "session id"],
  ["#/fork/source%20id/42", "source id"],
])("refreshing %s provides a transcript query ID before bootstrap is ready", (hash, sessionId) => {
  const page = pageFromHash(hash),
    pending = resolvePage(page, [], false);
  expect(pageSessionId(pending)).toBe(sessionId);
  expect(pageSessionId(resolvePage(page, [{ id: sessionId }], true))).toBe(sessionId);
});
test.each(["#/sessions/missing", "#/fork/missing/42"])(
  "a missing session stops being a transcript source after bootstrap resolves: %s",
  (hash) => {
    const page = pageFromHash(hash);
    expect(pageSessionId(resolvePage(page, [], false))).toBe("missing");
    expect(pageSessionId(resolvePage(page, [], true))).toBeUndefined();
  },
);
test("a new-session page never requests a transcript", () => {
  const page = pageFromHash("#/new");
  expect(pageSessionId(resolvePage(page, [], false))).toBeUndefined();
  expect(pageSessionId(resolvePage(page, [{ id: "existing" }], true))).toBeUndefined();
});
