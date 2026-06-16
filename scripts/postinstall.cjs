"use strict";

const { execSync } = require("node:child_process");

function run(label, cmd, { required = true } = {}) {
  try {
    execSync(cmd, { stdio: "inherit" });
    return true;
  } catch (error) {
    if (required) {
      console.error(`postinstall: required step failed (${label})`);
      process.exit(1);
    }
    console.warn(`postinstall: optional step skipped (${label})`);
    return false;
  }
}

run("patch-package", "npx patch-package", { required: false });
run("patch-maplibre-dist", "node scripts/patch-maplibre-dist.cjs", { required: false });
run("copy-maplibre-worker", "node scripts/copy-maplibre-worker.cjs", { required: true });
