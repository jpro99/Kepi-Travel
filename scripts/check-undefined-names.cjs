#!/usr/bin/env node
/**
 * G44 — fail the build on undefined identifiers (TS2304 / TS2552).
 *
 * next.config sets ignoreBuildErrors, so a missing import compiles fine and
 * then throws "X is not defined" in the browser. Those are always real bugs.
 */
const { execFileSync } = require("node:child_process");

const IGNORED_FILE_PATTERNS = [/src[\\/]lib[\\/]sentience[\\/]engine\.test\.ts/];

function runTypecheck() {
  try {
    return execFileSync("npx", ["tsc", "--noEmit"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}

const output = runTypecheck();
const findings = output
  .split("\n")
  .filter((line) => /error TS(2304|2552):/.test(line))
  .filter((line) => !IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(line)))
  .map((line) => line.trim());

if (findings.length > 0) {
  console.error(
    `\nUndefined identifiers found (${findings.length}). These crash at runtime as "X is not defined":\n`,
  );
  for (const finding of findings) {
    console.error(`  ${finding}`);
  }
  console.error("\nAdd the missing import. Re-exports (`export { x } from`) do NOT bind x locally.\n");
  process.exit(1);
}

console.log("check-undefined-names: no undefined identifiers.");
