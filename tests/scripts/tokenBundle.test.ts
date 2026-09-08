import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { build } from "vite";
import { frontendBuild } from "../../settings/bundling";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import vocabulary from "gpt-tokenizer/bpeRanks/o200k_base";
import { vocabularyChunks } from "../../scripts/vocabularyChunks";

test("splits the token vocabulary without changing token ranks or exceeding the chunk limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "omity-token-bundle-"));
  try {
    const output = await build({
        build: {
          ...frontendBuild,
          lib: {
            entry: Bun.resolveSync("gpt-tokenizer/bpeRanks/o200k_base", import.meta.dir),
            fileName: "vocabulary",
            formats: ["es"],
          },
          outDir: directory,
        },
        configFile: false,
        logLevel: "silent",
        plugins: [vocabularyChunks(200_000)],
        publicDir: false,
      }),
      chunks = (Array.isArray(output) ? output : [output]).flatMap((result) => {
        if (!("output" in result)) {
          throw new Error("词表测试不支持 watch 构建");
        }
        return result.output.filter((item) => item.type === "chunk");
      }),
      entry = chunks.find((chunk) => chunk.isEntry);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => Buffer.byteLength(chunk.code) < 500_000)).toBeTrue();
    expect(entry).toBeDefined();
    const { default: bundled } = await import(pathToFileURL(join(directory, entry!.fileName)).href);
    expect(bundled).toEqual(vocabulary);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
