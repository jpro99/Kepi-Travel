import test from "node:test";
import assert from "node:assert/strict";
import {
  airportServesStayCity,
  inboundFlightCoversMetroTransfer,
  isLocalGroundHop,
} from "@/lib/travelAssistant/metroAirportCoverage";

test("airportServesStayCity maps Puglia coast to BRI", () => {
  assert.equal(airportServesStayCity("BRI", "Polignano a Mare"), true);
  assert.equal(airportServesStayCity("BRI", "Monopoli"), true);
  assert.equal(airportServesStayCity("FCO", "Polignano a Mare"), false);
});

test("isLocalGroundHop treats Monopoli and Polignano as a short hop", () => {
  assert.equal(isLocalGroundHop("Monopoli", "Polignano a Mare"), true);
});

test("inboundFlightCoversMetroTransfer accepts BRI landing with Polignano stay", () => {
  assert.equal(
    inboundFlightCoversMetroTransfer({
      fromLabel: "Bari",
      toLabel: "Polignano a Mare",
      fromIata: "BRI",
      arrivalIata: "BRI",
    }),
    true,
  );
});
