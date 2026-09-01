import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("AirportMode navigator map uses navIata and campus flight — not ONT when at SEA", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/travelAssistant/AirportMode.tsx"),
    "utf8",
  );
  const navigatorBlocks = src.match(/<AirportNavigatorMap[\s\S]*?\/>/g) ?? [];
  assert.ok(navigatorBlocks.length >= 2, "expected arrive + depart navigator maps");
  for (const block of navigatorBlocks) {
    assert.match(block, /iata=\{navIata\}/);
    assert.doesNotMatch(block, /iata=\{f\.flightDepartureAirport/);
  }
  assert.match(src, /navigatorMapFlight/);
});
