import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { rmSync } from "node:fs";

interface AuthFileOptions {
  accessToken?: string;
  accountId?: string | null;
  idToken?: string;
  lastRefresh?: string;
  refreshToken?: string;
}
export function createTestJwt(claims: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.`;
}
export async function createOAuthFile(options: AuthFileOptions = {}) {
  const directory = createTestDirectory("oauth-credentials"),
    path = join(directory, "auth.json");
  await Bun.write(
    path,
    JSON.stringify({
      auth_mode: "chatgpt",
      last_refresh: options.lastRefresh ?? new Date().toISOString(),
      tokens: {
        access_token: options.accessToken ?? "codex-test-token",
        account_id: options.accountId === undefined ? "test-account" : options.accountId,
        id_token: options.idToken,
        refresh_token: options.refreshToken,
      },
    }),
  );
  return {
    directory,
    path,
    [Symbol.dispose]() {
      rmSync(directory, { force: true, recursive: true });
    },
  };
}
