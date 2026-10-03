import { expect, spyOn, test } from "bun:test";
import { createQueryClient } from "../../../../src/app/frontend/services/remoteStore";
import { deleteSession } from "../../../../src/app/frontend/services/client";
import { reportPromiseErrors } from "../../../../src/app/frontend/services/errors";

test("an HTTP failure is logged by its action boundary and not by the transport", async () => {
  const fetcher = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: { code: "SESSION_NOT_FOUND", message: "missing session" } },
        { status: 404 },
      ),
    ),
    logged = spyOn(console, "error").mockReturnValue(undefined);
  try {
    const action = async () => {
      try {
        await deleteSession("missing");
      } catch (error) {
        expect(logged).not.toHaveBeenCalled();
        throw error;
      }
    };
    reportPromiseErrors(action());
    await Bun.sleep(0);
    expect(logged).toHaveBeenCalledTimes(1);
  } finally {
    fetcher.mockRestore();
    logged.mockRestore();
  }
});
test("response validation is reported by its action boundary without suppressing repeated occurrences", async () => {
  const fetcher = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ wrong: true }))
      .mockResolvedValueOnce(Response.json({ wrong: true })),
    logged = spyOn(console, "error").mockReturnValue(undefined);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = logged.mock.calls.length,
        action = async () => {
          try {
            await deleteSession("invalid");
          } catch (error) {
            expect(logged).toHaveBeenCalledTimes(before);
            throw error;
          }
        };
      reportPromiseErrors(action());
      await Bun.sleep(0);
    }
    expect(logged).toHaveBeenCalledTimes(2);
  } finally {
    fetcher.mockRestore();
    logged.mockRestore();
  }
});
test("query execution logs each failed occurrence once even when the thrown object is reused", async () => {
  const failure = new Error("network failure"),
    fetcher = spyOn(globalThis, "fetch").mockRejectedValue(failure),
    logged = spyOn(console, "error").mockReturnValue(undefined),
    client = createQueryClient();
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let caught: unknown;
      try {
        await client.query({ queryFn: () => deleteSession("missing"), queryKey: ["request"] });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(failure);
    }
    expect(logged).toHaveBeenCalledTimes(2);
    expect(logged.mock.calls[0]).toEqual([failure, { queryKey: ["request"] }]);
    expect(logged.mock.calls[1]).toEqual(logged.mock.calls[0]);
  } finally {
    client.clear();
    fetcher.mockRestore();
    logged.mockRestore();
  }
});
