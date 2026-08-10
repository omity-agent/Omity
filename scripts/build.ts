import { mkdir, rm } from "node:fs/promises";
import { build } from "vite";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, ".."),
  frontendDirectory = resolve(root, "src/app/frontend"),
  frontendOutput = resolve(frontendDirectory, "dist"),
  executableOutput = resolve(root, "dist/omity.exe");
await rm(frontendOutput, { force: true, recursive: true });
await build({
  build: {
    emptyOutDir: true,
    outDir: frontendOutput,
  },
  configFile: resolve(root, "vite.config.ts"),
});
await mkdir(resolve(root, "dist"), { recursive: true });
const compile = {
    assets: ["./settings", "./src/app/frontend/dist", "./src/infrastructure/database/migrations"],
    outfile: executableOutput,
  } satisfies Bun.CompileBuildOptions & { assets: string[] },
  executable = await Bun.build({
    bytecode: true,
    compile,
    entrypoints: ["./src/cli.ts"],
    format: "esm",
    minify: true,
    root,
    sourcemap: "linked",
  });
if (!executable.success) {
  throw new AggregateError(executable.logs, "可执行程序构建失败");
}
