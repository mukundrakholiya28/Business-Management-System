/**
 * generate-sw-precache.mjs
 * Run after `next build`. Reads .next/static and writes a JSON asset list
 * that sw.js uses to pre-cache all built JS/CSS chunks at install time.
 */

import { readdir, writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname  = fileURLToPath(new URL(".", import.meta.url));
const ROOT       = join(__dirname, "..");
const STATIC_DIR = join(ROOT, ".next", "static");
const OUT_FILE   = join(ROOT, "public", "sw-precache.json");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files   = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...await walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  let assets = [];
  try {
    const files = await walk(STATIC_DIR);
    assets = files
      .filter((f) => (f.endsWith(".js") || f.endsWith(".css")) && !f.endsWith(".map"))
      .map((f) => {
        // Convert absolute Windows path to a URL path: /_next/static/...
        const rel = f.slice(ROOT.length).replace(/\\/g, "/");
        return rel.startsWith("/.next/static/")
          ? "/_next/static/" + rel.slice("/.next/static/".length)
          : null;
      })
      .filter(Boolean);
  } catch (e) {
    console.warn("[sw-precache] Could not read .next/static:", e.message);
  }

  const payload = { assets, generatedAt: new Date().toISOString() };
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`[sw-precache] Wrote ${assets.length} assets to public/sw-precache.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
