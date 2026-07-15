import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SECURITY_APPROX_DISCLAIMER, SECURITY_APPROX_TAG } from "./securityDisclosure";

/**
 * KEPI_DESIGN_LAW M32 — the mandatory security disclaimer must stay verbatim and
 * un-softened, and the map must actually use the shared constant (never re-inline
 * a weaker string). If a future edit softens the copy or drops the disclaimer,
 * one of these assertions fails.
 */

test("security disclaimer keeps its mandatory, un-softened phrasing", () => {
  assert.match(SECURITY_APPROX_DISCLAIMER, /Approximate security screening area/);
  assert.match(SECURITY_APPROX_DISCLAIMER, /can change without notice/);
  assert.match(SECURITY_APPROX_DISCLAIMER, /Follow posted airport signage/);
  assert.equal(SECURITY_APPROX_TAG, "approx. area");
});

test("AirportNavigatorMap renders the shared disclaimer, not a hardcoded one", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../components/travelAssistant/AirportNavigatorMap.tsx", import.meta.url)),
    "utf8",
  );
  assert.ok(
    src.includes("SECURITY_APPROX_DISCLAIMER"),
    "AirportNavigatorMap must render {SECURITY_APPROX_DISCLAIMER} so the mandated copy can't drift.",
  );
  assert.ok(
    src.includes("SECURITY_APPROX_TAG"),
    "Security markers must tag the label with SECURITY_APPROX_TAG (approx. area).",
  );
});
