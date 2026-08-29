import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const child = spawn(process.execPath, [
  vitest,
  "run",
  "src/__tests__/firestore-rules.integration.test.ts",
  "src/__tests__/firestore-commit-preconditions.integration.test.ts",
], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, RUN_FIRESTORE_INTEGRATION: "1" },
});

child.on("exit", (code) => process.exit(code ?? 1));
