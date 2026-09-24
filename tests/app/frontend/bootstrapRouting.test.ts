import { expect, test } from "bun:test";
import {
  pageFromHash,
  pageSessionId,
  resolvePage,
  transcriptSessionId,
} from "../../../src/app/frontend/route";

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
test("deleting the active session disables its transcript source while the request is pending", () => {
  expect(transcriptSessionId("deleting", "deleting")).toBeUndefined();
  expect(transcriptSessionId("other", "deleting")).toBe("other");
  expect(transcriptSessionId(undefined, "deleting")).toBeUndefined();
});
