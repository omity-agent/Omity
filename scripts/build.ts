import { join, resolve } from "node:path";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { build } from "vite";

const databases = [
    {
      name: "access",
      schema: "./src/app/access/schema.ts",
    },
    {
      name: "session",
      schema: "./src/infrastructure/database/schema/index.ts",
    },
  ] as const,
  root = resolve(import.meta.dir, ".."),
  migrationsRoot = resolve(root, "migrations"),
  frontendDirectory = resolve(root, "src/app/frontend"),
  frontendOutput = resolve(frontendDirectory, "dist"),
  executableOutput = resolve(root, "dist/omity.exe");
try {
  await generateMigrations();
  const [node, script, command] = process.argv;
  void node;
  void script;
  if (command !== undefined && command !== "--test") {
    throw new Error(`未知构建参数：${command}`);
  }
  const run = command === "--test" ? runTests : buildApplication;
  await run();
} finally {
  await rm(migrationsRoot, { force: true, recursive: true });
}

async function buildApplication() {
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
      assets: ["./settings", "./src/app/frontend/dist", "./migrations"],
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
}
async function generateMigrations() {
  await rm(migrationsRoot, { force: true, recursive: true });
  const results = await Promise.allSettled(databases.map(generateMigration)),
    errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (errors.length > 0) {
    throw new AggregateError(errors, "数据库迁移生成失败");
  }
  await Promise.all(databases.map(flattenMigration));
}
async function generateMigration(database: (typeof databases)[number]) {
  const child = Bun.spawn(
      [
        process.execPath,
        "x",
        "drizzle-kit",
        "generate",
        "--dialect=sqlite",
        `--schema=${database.schema}`,
        `--out=./migrations/${database.name}`,
      ],
      {
        cwd: root,
        stderr: "inherit",
        stdout: "inherit",
      },
    ),
    exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${database.name} 数据库生成失败，退出码：${exitCode.toString()}`);
  }
}
async function flattenMigration(database: (typeof databases)[number]) {
  const databaseDirectory = join(migrationsRoot, database.name),
    entries = await readdir(databaseDirectory, { withFileTypes: true }),
    directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length !== 1 || entries.length !== 1) {
    throw new Error(`${database.name} 数据库迁移目录结构无效`);
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
    throw new Error(`${database.name} 数据库迁移文件结构无效`);
  }
  await Promise.all(
    expectedFiles.map((file) =>
      rename(join(generatedDirectory, file), join(databaseDirectory, file)),
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
