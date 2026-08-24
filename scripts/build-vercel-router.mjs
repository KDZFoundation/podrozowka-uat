import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  absWorkingDir: projectRoot,
  entryPoints: ["./server/vercel-router.ts"],
  bundle: true,
  minify: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  outfile: "./api/_router.cjs",
});
