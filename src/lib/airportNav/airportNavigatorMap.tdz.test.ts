import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Gate-walk reroute called startRoute in a useEffect above its useCallback —
 * runtime TDZ: "Cannot access 'n1' before initialization" on Live Map (e26b724).
 */
test("AirportNavigatorMap: startRoute is declared before any effect that depends on it (TDZ)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/AirportNavigatorMap.tsx"),
    "utf8",
  );
  const startRouteDecl = src.search(/const startRoute = useCallback/u);
  assert.ok(startRouteDecl > 0, "startRoute useCallback missing");
  const beforeStart = src.slice(0, startRouteDecl);
  assert.doesNotMatch(
    beforeStart,
    /useEffect\([\s\S]*?\[[\s\S]*?\bstartRoute\b[\s\S]*?\]\s*\)/u,
    "startRoute must not appear in a useEffect dependency array before it is declared",
  );
  const gateReroute = src.search(/startRoute\(nextId, false\)/u);
  assert.ok(gateReroute > startRouteDecl, "gate reroute effect must sit below startRoute");
});

test("LiveMap error boundary auto-recovers stale TDZ bundles", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/travel-assistant/live-map/page.tsx"),
    "utf8",
  );
  assert.match(src, /isStaleBundleError/);
  assert.match(src, /recoverStaleClientBundle/);
});
