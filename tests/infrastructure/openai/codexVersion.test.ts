import {
  createCodexVersionResolver,
  fetchLatestCodexVersion,
} from "../../../src/infrastructure/openai/codexVersion";
import { expect, test } from "bun:test";
import { codexDefaultHeaders } from "../../../src/infrastructure/openai/clientIdentity";
import { codexProtocol } from "../../../settings/openai/codexProtocol";

test("fetches the latest Codex version from npm", async () => {
  let requestedUrl: string | undefined;
  const version = await fetchLatestCodexVersion(async (input, init) => {
    requestedUrl =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
    return Response.json({ name: "@openai/codex", version: "0.154.4" });
  });
  expect(requestedUrl).toBe(codexProtocol.npmLatestUrl);
  expect(version).toBe("0.154.4");
});
test("does not silently substitute a version when npm is unavailable", async () => {
  const resolver = createCodexVersionResolver(undefined, async () => {
    throw new Error("npm unavailable");
  });
  expect(resolver()).rejects.toThrow();
});
test("uses the session's in-memory Codex version in client headers", async () => {
  const headers = codexDefaultHeaders(await createCodexVersionResolver("0.154.4")());
  expect(headers.get("version")).toBe("0.154.4");
  expect(headers.get("user-agent")).toContain("codex_cli_rs/0.154.4");
});
