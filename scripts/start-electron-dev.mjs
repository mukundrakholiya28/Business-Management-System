/**
 * start-electron-dev.mjs
 * Development launcher: launches Next.js dev server and connects Electron to it.
 */

import { spawn } from "child_process";
import http from "http";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

function isServerRunning(port = 3000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
  });
}

async function waitForServer(port = 3000, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isServerRunning(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  let nextProc = null;
  const isAlreadyUp = await isServerRunning(3000);

  if (!isAlreadyUp) {
    console.log("[Electron Dev] Starting Next.js dev server on port 3000...");
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    nextProc = spawn(npmCmd, ["run", "dev"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
    });
  } else {
    console.log("[Electron Dev] Next.js dev server is already running on port 3000.");
  }

  console.log("[Electron Dev] Waiting for Next.js to be ready...");
  const ready = await waitForServer(3000, 30000);
  if (!ready) {
    console.warn("[Electron Dev] Warning: Next.js dev server did not respond in time, launching Electron anyway.");
  } else {
    console.log("[Electron Dev] Next.js dev server is ready!");
  }

  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const electronProc = spawn(npxCmd, ["electron", "."], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      ELECTRON_DEV_URL: "http://localhost:3000",
    },
  });

  electronProc.on("close", (code) => {
    console.log(`[Electron Dev] Electron closed with code ${code}.`);
    if (nextProc) {
      console.log("[Electron Dev] Terminating Next.js dev process...");
      nextProc.kill();
    }
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error("[Electron Dev] Startup error:", err);
  process.exit(1);
});

