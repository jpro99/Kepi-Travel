import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  flightBookLeadMode,
  nextFlightShowsStatusChrome,
  shouldAutoCheckNextFlightStatus,
  showFlightSearchLauncherAtTop,
  showFlightArrivalAirportMapCta,
  showFlightDepartureAirportMapCta,
} from "@/lib/travelAssistant/flightBookLead";

test("flightBookLeadMode prefers booked itinerary over search", () => {
  assert.equal(flightBookLeadMode({ upcomingFlightCount: 2 }), "itinerary");
  assert.equal(flightBookLeadMode({ upcomingFlightCount: 1 }), "itinerary");
});

test("flightBookLeadMode is empty when no upcoming flights", () => {
  assert.equal(flightBookLeadMode({ upcomingFlightCount: 0 }), "empty");
});

test("showFlightSearchLauncherAtTop only when empty, never while search is open", () => {
  assert.equal(showFlightSearchLauncherAtTop("empty", false), true);
  assert.equal(showFlightSearchLauncherAtTop("empty", true), false);
  assert.equal(showFlightSearchLauncherAtTop("itinerary", false), false);
});

test("showFlightDepartureAirportMapCta on any upcoming leg", () => {
  assert.equal(
    showFlightDepartureAirportMapCta({ isPast: false, departureIata: "ONT" }),
    true,
  );
  assert.equal(showFlightDepartureAirportMapCta({ isPast: true, departureIata: "ONT" }), false);
});

test("showFlightArrivalAirportMapCta when arrival differs from departure", () => {
  assert.equal(
    showFlightArrivalAirportMapCta({
      isPast: false,
      departureIata: "SEA",
      arrivalIata: "FCO",
    }),
    true,
  );
  assert.equal(
    showFlightArrivalAirportMapCta({
      isPast: false,
      departureIata: "SEA",
      arrivalIata: "SEA",
    }),
    false,
  );
});

test("shouldAutoCheckNextFlightStatus stays inside the 24h F6 window", () => {
  assert.equal(
    shouldAutoCheckNextFlightStatus({
      hasNextFlight: true,
      hasLiveStatus: false,
      hoursUntilDeparture: 6,
    }),
    true,
  );
  assert.equal(
    shouldAutoCheckNextFlightStatus({
      hasNextFlight: true,
      hasLiveStatus: false,
      hoursUntilDeparture: 48,
    }),
    false,
  );
  assert.equal(
    shouldAutoCheckNextFlightStatus({
      hasNextFlight: true,
      hasLiveStatus: true,
      hoursUntilDeparture: 2,
    }),
    false,
  );
});

test("nextFlightShowsStatusChrome is on the next ticket without expanding", () => {
  assert.equal(nextFlightShowsStatusChrome({ isNextFlight: true, isPast: false }), true);
  assert.equal(nextFlightShowsStatusChrome({ isNextFlight: false, isPast: false }), false);
  assert.equal(nextFlightShowsStatusChrome({ isNextFlight: true, isPast: true }), false);
});

test("G18 FlightsTab leads with tickets, live status, and airport map — no emoji chrome", () => {
  const src = readFileSync(join(process.cwd(), "src/components/travelAssistant/FlightsTab.tsx"), "utf8");
  assert.doesNotMatch(src, /🛫/);
  assert.doesNotMatch(src, /✈️/);
  assert.match(src, /showFlightSearchLauncherAtTop/);
  assert.match(src, /AirportMapRow/);
  assert.match(src, /StatusBadge/);
  assert.match(src, /shouldAutoCheckNextFlightStatus/);
});
