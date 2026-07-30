import test from "node:test";
import assert from "node:assert/strict";
import { hasLiveFlightStatusCredentials } from "@/lib/travelAssistant/flightStatusCredentials";

test("hasLiveFlightStatusCredentials is boolean (env-dependent)", () => {
  assert.equal(typeof hasLiveFlightStatusCredentials(), "boolean");
});
