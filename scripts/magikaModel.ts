import { dirname, isAbsolute, relative, resolve } from "node:path";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { Magika } from "magika";
import { z } from "zod";

const modelManifestSchema = z.object({
  weightsManifest: z.array(
    z.object({
      paths: z.array(z.string().min(1)),
    }),
  ),
});
const sourceSchema = z.object({
  modelConfigURL: z.url(),
  modelURL: z.url(),
});
type Fetch = (url: string) => Promise<Response>;
const source = {
  modelConfigURL: Magika.MODEL_CONFIG_URL,
  modelURL: Magika.MODEL_URL,
};
export async function prepareMagikaAssets(cacheDirectory: string, fetcher: Fetch = fetch) {
  const publicDirectory = resolve(cacheDirectory, "public"),
    sourcePath = resolve(cacheDirectory, "source.json");
  if (await hasCompleteCache(publicDirectory, sourcePath)) {
    return publicDirectory;
  }
  const stagingDirectory = resolve(cacheDirectory, `staging-${crypto.randomUUID()}`);
  try {
    await downloadAssets(stagingDirectory, fetcher);
    await rm(publicDirectory, { force: true, recursive: true });
    await mkdir(cacheDirectory, { recursive: true });
    await rename(stagingDirectory, publicDirectory);
    await writeFile(sourcePath, JSON.stringify(source));
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true });
  }
  return publicDirectory;
}
async function downloadAssets(publicDirectory: string, fetcher: Fetch) {
  const outputDirectory = resolve(publicDirectory, "assets/magika"),
    model = await download(source.modelURL, fetcher),
    shards = modelShardPaths(model);
  await Promise.all([
    writeAsset(outputDirectory, "model.json", model),
    downloadAsset(outputDirectory, "config.min.json", source.modelConfigURL, fetcher),
    ...shards.map((path) =>
      downloadAsset(outputDirectory, path, new URL(path, source.modelURL).href, fetcher),
    ),
  ]);
}
async function hasCompleteCache(publicDirectory: string, sourcePath: string) {
  const sourceFile = Bun.file(sourcePath);
  if (!(await sourceFile.exists())) {
    return false;
  }
  try {
    const cachedSource = sourceSchema.parse(await sourceFile.json());
    if (
      cachedSource.modelURL !== source.modelURL ||
      cachedSource.modelConfigURL !== source.modelConfigURL
    ) {
      return false;
    }
    const outputDirectory = resolve(publicDirectory, "assets/magika"),
      modelFile = Bun.file(resolve(outputDirectory, "model.json"));
    if (!(await modelFile.exists())) {
      return false;
    }
    model = await modelFile.arrayBuffer(),
      shards = modelShardPaths(new Uint8Array(model)),
      assets = ["config.min.json", ...shards].map((path) =>
        Bun.file(assetPath(outputDirectory, path)),
      );
    return (await Promise.all(assets.map((file) => file.exists()))).every(Boolean);
  } catch (error) {
    console.warn("Magika 模型缓存无效，将重新下载", error);
    return false;
  }
}
function modelShardPaths(model: Uint8Array) {
  const manifest = modelManifestSchema.parse(JSON.parse(new TextDecoder().decode(model)));
  return [...new Set(manifest.weightsManifest.flatMap(({ paths }) => paths))];
}
async function downloadAsset(
  directory: string,
  path: string,
  url: string,
  fetcher: Fetch,
) {
  await writeAsset(directory, path, await download(url, fetcher));
}
async function download(url: string, fetcher: Fetch) {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Magika 模型下载失败：${response.status.toString()} ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
async function writeAsset(directory: string, path: string, content: Uint8Array) {
  const destination = assetPath(directory, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content);
}
function assetPath(directory: string, path: string) {
  const destination = resolve(directory, path),
    relativePath = relative(directory, destination);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Magika 模型清单包含越界路径：${path}`);
  }
  return destination;
}
