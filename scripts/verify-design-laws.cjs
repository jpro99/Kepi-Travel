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
}

main();
