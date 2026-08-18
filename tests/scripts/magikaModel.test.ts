import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { prepareMagikaAssets } from "../../scripts/magikaModel";
import { tmpdir } from "node:os";

test("reuses a complete Magika model cache", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "omity-magika-"));
  try {
    const requests: string[] = [],
      fetcher = mockFetcher(requests),
      publicDirectory = await prepareMagikaAssets(cacheDirectory, fetcher);
    expect(requests).toHaveLength(3);
    expect(await Bun.file(join(publicDirectory, "assets/magika/model.json")).exists()).toBeTrue();
    requests.length = 0;
    expect(await prepareMagikaAssets(cacheDirectory, fetcher)).toBe(publicDirectory);
    expect(requests).toHaveLength(0);
  } finally {
    await rm(cacheDirectory, { force: true, recursive: true });
  }
});
function mockFetcher(requests: string[]): (url: string) => Promise<Response> {
  return (url) => {
    requests.push(url);
    if (url.endsWith("/model.json")) {
      return Promise.resolve(
        Response.json({
          weightsManifest: [{ paths: ["group1-shard1of1.bin"], weights: [] }],
        }),
      );
    }
    return Promise.resolve(new Response("model data"));
  };
}
