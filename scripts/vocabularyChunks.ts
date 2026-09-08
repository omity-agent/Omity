import type { Plugin } from "vite";

export const vocabularyModulePrefix = "\0omity-vocabulary:";
export function vocabularyChunks(maxBytes: number): Plugin {
  const modules = new Map<string, string>();
  return {
    apply: "build",
    load: {
      filter: {
        id: [/[/\\]gpt-tokenizer[/\\]esm[/\\]bpeRanks[/\\]o200k_base\.js$/, /^\0omity-vocabulary:/],
      },
      async handler(id) {
        if (id.startsWith(vocabularyModulePrefix)) {
          const source = modules.get(id);
          if (source === undefined) {
            throw new Error(`缺少 Token 词表分片：${id}`);
          }
          return source;
        }
        const { default: vocabulary } = await import("gpt-tokenizer/bpeRanks/o200k_base"),
          shards: string[][] = [];
        let entries: string[] = [],
          bytes = 0;
        for (const token of vocabulary) {
          const serialized = JSON.stringify(token),
            size = Buffer.byteLength(serialized) + 1;
          if (size > maxBytes) {
            throw new Error("单个 Token 词条超过分片大小限制");
          }
          if (bytes + size > maxBytes) {
            shards.push(entries);
            entries = [];
            bytes = 0;
          }
          entries.push(serialized);
          bytes += size;
        }
        if (entries.length > 0) {
          shards.push(entries);
        }
        const imports = shards.map((shard, index) => {
          const moduleId = `${vocabularyModulePrefix}${index.toString()}`;
          modules.set(moduleId, `export default [${shard.join(",")}];`);
          return `import shard${index.toString()} from ${JSON.stringify(moduleId)};`;
        });
        return [
          ...imports,
          `export default [].concat(${shards.map((_, index) => `shard${index.toString()}`).join(",")});`,
        ].join("\n");
      },
    },
    name: "token-vocabulary-chunks",
    resolveId(id) {
      return id.startsWith(vocabularyModulePrefix) ? id : undefined;
    },
  };
}
