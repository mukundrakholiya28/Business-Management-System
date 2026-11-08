/**
 * prepare-standalone.mjs
 * Copies public/ and .next/static into .next/standalone/ so that
 * the Next.js standalone server can serve all static files and service worker.
 */

import { cp, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const STANDALONE_DIR = join(ROOT, ".next", "standalone");
const PUBLIC_SRC = join(ROOT, "public");
const PUBLIC_DEST = join(STANDALONE_DIR, "public");
const STATIC_SRC = join(ROOT, ".next", "static");
const STATIC_DEST = join(STANDALONE_DIR, ".next", "static");

async function main() {
  // On Vercel or when standalone output is disabled, skip gracefully
  if (process.env.VERCEL === "1" || !existsSync(STANDALONE_DIR)) {
    console.log("[prepare-standalone] Skipping standalone preparation (running on Vercel or non-standalone build).");
    process.exit(0);
  }

  try {
    await mkdir(PUBLIC_DEST, { recursive: true });
    await cp(PUBLIC_SRC, PUBLIC_DEST, { recursive: true });
    console.log("[prepare-standalone] Copied public/ -> .next/standalone/public");

    await mkdir(STATIC_DEST, { recursive: true });
    await cp(STATIC_SRC, STATIC_DEST, { recursive: true });
    console.log("[prepare-standalone] Copied .next/static/ -> .next/standalone/.next/static");
  } catch (err) {
    console.error("[prepare-standalone] Error copying standalone assets:", err.message);
    process.exit(1);
  }
}

main();
