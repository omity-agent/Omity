import { claimShortId, claimShortIdAsync } from "../../src/infrastructure/randomId";
import { expect, test } from "bun:test";

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
