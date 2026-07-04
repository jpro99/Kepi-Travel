import test from "node:test";
import assert from "node:assert/strict";
import {
  buildForwardAfterBookHint,
  buildTripFirstBody,
  buildTripFirstHeadline,
} from "@/lib/travelAssistant/tripFirstMessaging";

test("trip-first messaging highlights forward after external booking", () => {
  assert.match(buildTripFirstHeadline(), /Kepi runs the trip/i);
  assert.match(buildTripFirstBody("flight"), /forward/i);
  assert.match(buildTripFirstBody("hotel"), /Google/i);
  assert.match(buildForwardAfterBookHint(), /forward/i);
});
