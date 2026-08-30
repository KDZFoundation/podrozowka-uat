import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const outfile = "./api/_router.cjs";

await build({
  absWorkingDir: projectRoot,
  entryPoints: ["./server/vercel-router.ts"],
  bundle: true,
  minify: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  outfile,
});

const bundlePath = path.resolve(projectRoot, outfile);
const bundle = await readFile(bundlePath, "utf8");
const normalizedBundle = bundle
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .join("\n")
  .replace(/\n*$/, "\n");
await writeFile(bundlePath, normalizedBundle, "utf8");
