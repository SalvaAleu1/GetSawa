import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const sourceSchema = path.join(repoRoot, "prisma", "schema.prisma");
const workerSchema = path.join(repoRoot, "prisma", ".schema.worker.prisma");
const prismaBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);

const source = await readFile(sourceSchema, "utf8");
const generatorBlock = 'generator client {\n  provider = "prisma-client-js"\n}';
const workerGeneratorBlock = 'generator client {\n  provider = "prisma-client-js"\n  previewFeatures = ["driverAdapters"]\n}';

if (!source.includes(generatorBlock) && !source.includes(workerGeneratorBlock)) {
  throw new Error("Unable to locate the Prisma client generator block.");
}

const workerSource = source.includes(workerGeneratorBlock)
  ? source
  : source.replace(generatorBlock, workerGeneratorBlock);

await writeFile(workerSchema, workerSource, "utf8");

try {
  const result = spawnSync(prismaBin, ["generate", "--schema", workerSchema], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  await unlink(workerSchema).catch(() => undefined);
}
