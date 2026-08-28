import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseCli = path.join(root, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const execFileAsync = promisify(execFile);

const listeningProcessIds = async (port) => {
  if (process.platform !== "win32") return new Set();
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `$items = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess); $items -join ' '`,
  ]).catch(() => ({ stdout: "" }));
  return new Set(stdout.split(/\s+/).map(Number).filter(Number.isInteger));
};

const stopNewEmulator = async (before) => {
  if (process.platform !== "win32") return;
  // firebase-tools occasionally leaves its Java Firestore child alive on
  // Windows. Only terminate a listener that did not exist before this test.
  const after = await listeningProcessIds(8080);
  const orphan = [...after].filter((pid) => !before.has(pid));
  if (!orphan.length) return;
  await execFileAsync("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${orphan.join(",")} -Force`]);
};

const listenersBeforeStart = await listeningProcessIds(8080);
const child = spawn(process.execPath, [firebaseCli, "emulators:exec", "--only", "firestore,auth", "node scripts/run-firestore-rule-tests.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, FIREBASE_TEST_PROJECT_ID: process.env.FIREBASE_TEST_PROJECT_ID || "podrozowka" },
});

child.on("exit", async (code) => {
  await stopNewEmulator(listenersBeforeStart).catch(() => undefined);
  process.exit(code ?? 1);
});
