import { codexProtocol } from "../../../settings/openai/codexProtocol";
import { localize } from "../../i18n/server";
import { z } from "zod";

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u),
  packageMetadataSchema = z.object({ version: versionSchema });
type CodexVersionFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type CodexVersionResolver = () => Promise<string>;

export async function fetchLatestCodexVersion(fetcher: CodexVersionFetch = globalThis.fetch) {
  const response = await fetcher(codexProtocol.npmLatestUrl, {
    cache: "no-store",
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(
      localize("network:codex.latestVersionFetchFailed", {
        value0: response.status.toString(),
      }),
    );
  }
  const metadata: unknown = await response.json();
  return packageMetadataSchema.parse(metadata).version;
}

export function createCodexVersionResolver(
  version?: string,
  fetcher: CodexVersionFetch = globalThis.fetch,
): CodexVersionResolver {
  let pending: Promise<string> | undefined;
  return async () => {
    if (version !== undefined) {
      return versionSchema.parse(version);
    }
    return (pending ??= fetchLatestCodexVersion(fetcher));
  };
}
