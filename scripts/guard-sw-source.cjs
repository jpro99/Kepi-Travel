#!/usr/bin/env node
/**
 * I61 guard — next-pwa injectManifest overwrites public/sw.js at build time.
 * Hand-authored source must live in public/sw-src.js only; never commit the
 * minified build artifact as source (Vercel prebuild test:laws reads sw-src).
 */
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const SW_SRC = join(process.cwd(), "public/sw-src.js");
const SW_OUT = join(process.cwd(), "public/sw.js");

function fail(message) {
  console.error(`[guard-sw-source] ${message}`);
  process.exit(1);
}

if (!existsSync(SW_SRC)) {
  fail("missing public/sw-src.js — restore from git before building");
}

const src = readFileSync(SW_SRC, "utf8");
if (!src.includes("function cacheIfOk")) {
  fail("public/sw-src.js must define cacheIfOk (I61 — never cache failed chunks)");
}
if (!src.includes("self.__WB_MANIFEST")) {
  fail("public/sw-src.js must include self.__WB_MANIFEST for next-pwa injectManifest");
}
if (/^!function\(/u.test(src.trim())) {
  fail("public/sw-src.js looks like a minified build artifact — use public/sw-src.js as source only");
}

// If sw.js is tracked and matches minified output, agents may have committed build output.
if (existsSync(SW_OUT)) {
  const out = readFileSync(SW_OUT, "utf8");
  if (/^!function\(/u.test(out.trim()) && !out.includes("function cacheIfOk")) {
    console.warn(
      "[guard-sw-source] public/sw.js is minified build output (expected after local build). Do not commit it — source is public/sw-src.js",
    );
  }
}

console.log("[guard-sw-source] ok");
