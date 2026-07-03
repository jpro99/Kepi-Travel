import test from "node:test";
import assert from "node:assert/strict";
import { runItinerarySelfCheck } from "@/lib/travelAssistant/itinerarySelfCheck";

test("runItinerarySelfCheck passes when return home is covered via connections", () => {
  const result = runItinerarySelfCheck({
    reservations: [
      {
        id: "f1",
        type: "flight",
        confirmationCode: "ITA437",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "FCO",
        flightDate: "2026-09-25",
        flightDepartureTime: "2026-09-25T02:00",
      },
      {
        id: "f2",
        type: "flight",
        confirmationCode: "ASA181",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "SEA",
        flightDate: "2026-09-25",
        flightDepartureTime: "2026-09-25T06:15",
      },
      {
        id: "f3",
        type: "flight",
        confirmationCode: "ASA489",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "ONT",
        flightDate: "2026-09-25",
        flightDepartureTime: "2026-09-25T20:43",
      },
    ],
    plannedFlightLegs: [
      {
        id: "return",
        role: "return",
        fromIata: "MUC",
        toIata: "ONT",
        fromLabel: "Munich",
        toLabel: "Ontario",
        enabled: true,
        optional: false,
        departureDate: "2026-09-25",
        status: "booked",
      },
    ],
  });

  assert.equal(result.passed, true);
  assert.match(result.summary, /checks out/iu);
  const homeCheck = result.items.find((item) => item.id === "flight-home");
  assert.equal(homeCheck?.status, "pass");
});
