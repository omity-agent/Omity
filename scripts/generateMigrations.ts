import { join, resolve } from "node:path";
import { readdir, rename, rm } from "node:fs/promises";

const databases = ["access", "session"] as const,
  root = resolve(import.meta.dir, ".."),
  migrationsRoot = resolve(root, "src/infrastructure/database/migrations");
await rm(migrationsRoot, { force: true, recursive: true });
await Promise.all(databases.map(generateMigration));
await Promise.all(databases.map(flattenMigration));
async function generateMigration(database: (typeof databases)[number]) {
  const config = resolve(root, "settings", `${database}-db.ts`),
    child = Bun.spawn([process.execPath, "x", "drizzle-kit", "generate", `--config=${config}`], {
      cwd: root,
      stderr: "inherit",
      stdout: "inherit",
    }),
    exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${database} 数据库生成失败，退出码：${exitCode.toString()}`);
  }
}
async function flattenMigration(database: (typeof databases)[number]) {
  const databaseDirectory = join(migrationsRoot, database),
    entries = await readdir(databaseDirectory, { withFileTypes: true }),
    directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length !== 1 || entries.length !== 1) {
    throw new Error(`${database} 数据库迁移目录结构无效`);
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
    throw new Error(`${database} 数据库迁移文件结构无效`);
  }
  await Promise.all(
    expectedFiles.map((file) =>
      rename(join(generatedDirectory, file), join(databaseDirectory, file)),
    ),
  );
  await rm(generatedDirectory, { recursive: true });
}
