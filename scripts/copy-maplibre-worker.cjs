"use strict";

const fs = require("node:fs");
const path = require("node:path");

const WORKER = "maplibre-gl-csp-worker.js";
const destDir = path.join(__dirname, "../public");
const dest = path.join(destDir, WORKER);

function resolveWorkerSrc() {
  const fallbackPkgRoot = path.join(__dirname, "../node_modules/maplibre-gl");
  let pkgRoot = null;

  try {
    pkgRoot = path.dirname(
      require.resolve("maplibre-gl/package.json", { paths: [__dirname] }),
    );
  } catch {
    if (fs.existsSync(fallbackPkgRoot)) {
      pkgRoot = fallbackPkgRoot;
    }
  }

  if (!pkgRoot) {
    console.warn(
      "copy-maplibre-worker: maplibre-gl is not installed; skipping worker copy",
    );
    console.warn("  run: npm install");
    return null;
  }

  const candidates = [
    path.join(pkgRoot, "dist", WORKER),
    path.join(pkgRoot, WORKER),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  console.error("copy-maplibre-worker: missing worker in maplibre-gl package");
  console.error("  tried:", candidates.join("\n  tried: "));
  console.error("  run: npm install");
  process.exit(1);
}

const src = resolveWorkerSrc();
if (!src) {
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

const srcStat = fs.statSync(src);
let destStat;
try {
  destStat = fs.statSync(dest);
} catch {
  destStat = null;
}

if (
  destStat &&
  destStat.size === srcStat.size &&
  destStat.mtimeMs >= srcStat.mtimeMs
) {
  console.log("copy-maplibre-worker: up to date", dest);
  process.exit(0);
}

fs.copyFileSync(src, dest);
fs.utimesSync(dest, srcStat.atime, srcStat.mtime);
console.log("copy-maplibre-worker: copied to public/" + WORKER);
