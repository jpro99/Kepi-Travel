import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("I60: travel-assistant page imports trackEvent before Trip tab home_opened analytics", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/travel-assistant/page.tsx"),
    "utf8",
  );
  assert.match(
    src,
    /import\s*\{\s*trackEvent\s*\}\s*from\s*"@\/lib\/analytics\/trackEvent"/u,
    "trackEvent must be imported — Trip tab crashes with ReferenceError otherwise",
  );
  const importIdx = src.search(/import\s*\{\s*trackEvent\s*\}/u);
  const useIdx = src.search(/type:\s*"home_opened"/u);
  assert.ok(importIdx > 0, "trackEvent import missing");
  assert.ok(useIdx > 0, "home_opened analytics missing");
  assert.ok(importIdx < useIdx, "import must precede trackEvent usage");
});
