import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("LiveMapPage does not poll flight/gate status on the map (CEO supersede)", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../../components/travelAssistant/LiveMapPage.tsx", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(src, /useAtAirportFlightStatusPoll/);
  assert.match(src, /storedGateCode/);
  assert.match(src, /flightDepartureGate/);
});
