import { claimShortId, claimShortIdAsync, createShortId } from "../src/infrastructure/randomId";
import { expect, test } from "bun:test";

test("short IDs use eight lowercase base36 characters", () => {
  expect(createShortId()).toMatch(/^[0-9a-z]{8}$/);
});
test("short ID claims regenerate after collisions", async () => {
  const candidates = ["aaaaaaaa", "bbbbbbbb"],
    claimed = claimShortId(
      (id) => id !== "aaaaaaaa",
      () => candidates.shift() ?? "unexpect",
    ),
    asyncCandidates = ["cccccccc", "dddddddd"],
    asynchronouslyClaimed = await claimShortIdAsync(
      async (id) => id !== "cccccccc",
      () => asyncCandidates.shift() ?? "unexpect",
    );
  expect(claimed).toBe("bbbbbbbb");
  expect(asynchronouslyClaimed).toBe("dddddddd");
});
