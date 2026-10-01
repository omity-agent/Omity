import { backendPlugins, frontendOutput } from "../settings/bundling";
import { join, resolve } from "node:path";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { build } from "vite";
import { prepareMagikaAssets } from "./magikaModel";

const database = {
    name: "database",
    schema: "./src/infrastructure/database/schema/index.ts",
  } as const,
  root = resolve(import.meta.dir, ".."),
  databaseRoot = resolve(root, "dist/database"),
  frontendPublicCache = resolve(root, "dist/frontend-public"),
  executableOutput = resolve(root, "dist/omity.exe");
try {
  await generateDatabaseSchema();
  const [node, script, command] = process.argv;
  void node;
  void script;
  if (command !== undefined && command !== "--test" && command !== "--benchmark-mcp") {
    throw new Error(`未知构建参数：${command}`);
  }
  const run =
    command === "--test"
      ? runTests
      : command === "--benchmark-mcp"
        ? runMcpBenchmark
        : buildApplication;
  await run();
} finally {
  await rm(databaseRoot, { force: true, recursive: true });
}
async function buildApplication() {
  await rm(frontendOutput, { force: true, recursive: true });
  const frontendPublicDirectory = await prepareMagikaAssets(frontendPublicCache);
  await build({
    configFile: resolve(root, "vite.config.ts"),
    logLevel: "warn",
    publicDir: frontendPublicDirectory,
  });
  await mkdir(resolve(root, "dist"), { recursive: true });
  const compile = {
      assets: ["./settings", frontendOutput, databaseRoot],
      outfile: executableOutput,
    } satisfies Bun.CompileBuildOptions & { assets: string[] },
    executable = await Bun.build({
      bytecode: true,
      compile,
      entrypoints: ["./src/cli.ts"],
      format: "esm",
      minify: true,
      plugins: backendPlugins,
      root,
      sourcemap: "linked",
    });
  if (!executable.success) {
    throw new AggregateError(executable.logs, "可执行程序构建失败");
  }
}
async function generateDatabaseSchema() {
  await rm(databaseRoot, { force: true, recursive: true });
  await generateMigration(database);
  await flattenMigration(database);
}
async function generateMigration(specification: typeof database) {
  const child = Bun.spawn(
      [
        process.execPath,
        "x",
        "drizzle-kit",
        "generate",
        "--dialect=sqlite",
        `--schema=${specification.schema}`,
        `--out=${databaseRoot}`,
      ],
      {
        cwd: root,
        stderr: "inherit",
        stdout: "inherit",
      },
    ),
    exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${specification.name} 数据库生成失败，退出码：${exitCode.toString()}`);
  }
}
async function flattenMigration(specification: typeof database) {
  const databaseDirectory = databaseRoot,
    entries = await readdir(databaseDirectory, { withFileTypes: true }),
    directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length !== 1 || entries.length !== 1) {
    throw new Error(`${specification.name} 数据库结构目录无效`);
  }
  const generatedDirectory = join(databaseDirectory, directories[0]!.name),
    generatedEntries = await readdir(generatedDirectory, { withFileTypes: true }),
    generatedFiles = generatedEntries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .toSorted(),
    expectedFiles = ["migration.sql", "snapshot.json"];
  if (
    generatedFiles.length !== expectedFiles.length ||
    generatedFiles.some((file, index) => file !== expectedFiles[index])
  ) {
    throw new Error(`${specification.name} 数据库结构文件无效`);
  }
  await Promise.all(
    expectedFiles.map((file) =>
      rename(
        join(generatedDirectory, file),
        join(databaseDirectory, file === "migration.sql" ? "schema.sql" : file),
      ),
    ),
  );
  const schemaPath = join(databaseDirectory, "schema.sql"),
    schema = await readFile(schemaPath, "utf8");
  await writeFile(
    schemaPath,
    schema.replaceAll(
      /CREATE (?<kind>TABLE|(?:UNIQUE )?INDEX) /gu,
      "CREATE $<kind> IF NOT EXISTS ",
    ),
  );
  await rm(generatedDirectory, { recursive: true });
}
async function runTests() {
  const child = Bun.spawn([process.execPath, "test"], {
      cwd: root,
      stderr: "inherit",
      stdout: "inherit",
    }),
    exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`测试失败，退出码：${exitCode.toString()}`);
  }
}
async function runMcpBenchmark() {
  const child = Bun.spawn([process.execPath, "run", "tests/performance/runLatency.ts"], {
      cwd: root,
      stderr: "inherit",
      stdout: "inherit",
    }),
    exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`测试失败，退出码：${exitCode.toString()}`);
  }
}
