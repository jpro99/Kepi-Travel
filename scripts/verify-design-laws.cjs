"use strict";

/**
 * Ensures every test file listed in KEPI_DESIGN_LAW.md "Test index" exists on disk.
 * Run via: npm run verify:laws
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const LAW_FILE = path.join(ROOT, "KEPI_DESIGN_LAW.md");

function extractTestPaths(markdown) {
  const paths = new Set();
  const rowRe = /\|\s*[^|]+\|\s*`([^`]+\.test\.ts)`\s*\|/g;
  let match;
  while ((match = rowRe.exec(markdown)) !== null) {
    paths.add(match[1].trim());
  }
  return [...paths];
}

// Mobile UI rule (CLAUDE.md): overlays/sheets must not set document.body.style.overflow = "hidden"
// (breaks iOS pinch-zoom scrolling) and should use dvh, not bare vh, for full-viewport heights.
const MOBILE_OVERLAY_DIRS = ["src/components", "src/app"];
const BODY_OVERFLOW_HIDDEN_RE = /document\.body\.style\.overflow\s*=\s*["']hidden["']/;
const SHEET_LIKE_FILENAME_RE = /(Sheet|BottomSheet|Modal|Drawer)\.tsx$/;
const BARE_VH_CLASS_RE = /\[[0-9]+vh\]/;

function collectSourceFiles(relDir) {
  const files = [];
  const start = path.join(ROOT, relDir);
  if (!fs.existsSync(start)) return files;

  const stack = [start];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  return files;
}

function checkMobileOverlayRules() {
  const files = MOBILE_OVERLAY_DIRS.flatMap(collectSourceFiles);

  const bodyOverflowOffenders = [];
  const bareVhOffenders = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (BODY_OVERFLOW_HIDDEN_RE.test(content)) {
      bodyOverflowOffenders.push(path.relative(ROOT, file));
    }
    if (SHEET_LIKE_FILENAME_RE.test(path.basename(file)) && BARE_VH_CLASS_RE.test(content)) {
      bareVhOffenders.push(path.relative(ROOT, file));
    }
  }

  if (bodyOverflowOffenders.length > 0) {
    console.error(
      "verify-design-laws: mobile overlay rule violated — document.body.style.overflow = \"hidden\" breaks iOS pinch-zoom (CLAUDE.md Mobile UI rule):",
    );
    for (const file of bodyOverflowOffenders) console.error(`  - ${file}`);
    process.exit(1);
  }

  if (bareVhOffenders.length > 0) {
    console.warn(
      "verify-design-laws: warning — sheet-like component(s) use bare vh height classes instead of dvh (CLAUDE.md Mobile UI rule prefers 100dvh edge-to-edge):",
    );
    for (const file of bareVhOffenders) console.warn(`  - ${file}`);
  }
}

function main() {
  if (!fs.existsSync(LAW_FILE)) {
    console.error("verify-design-laws: missing KEPI_DESIGN_LAW.md");
    process.exit(1);
  }

  const markdown = fs.readFileSync(LAW_FILE, "utf8");
  const listed = extractTestPaths(markdown);

  if (listed.length === 0) {
    console.error("verify-design-laws: no test files found in Test index table");
    process.exit(1);
  }

  const missing = listed.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));

  if (missing.length > 0) {
    console.error("verify-design-laws: listed tests missing from repo:");
    for (const file of missing) console.error(`  - ${file}`);
    process.exit(1);
  }

  console.log(`verify-design-laws: ${listed.length} indexed law tests present.`);

  checkMobileOverlayRules();
}

main();
