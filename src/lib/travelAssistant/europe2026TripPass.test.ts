import assert from "node:assert/strict";
import test from "node:test";
import { buildTripActionItems } from "@/lib/travelAssistant/tripActionItems";
import { detectTripGaps } from "@/lib/travelAssistant/gapDetectionService";
import { resolveBoardingPassUrl, extractReservationSourceLinks } from "@/lib/travelAssistant/reservationLinks";

const EUROPE_NOW = Date.parse("2026-06-01T12:00:00Z");

test("Europe 2026 partial trip surfaces planning actions for missing return flight", () => {
  const items = buildTripActionItems({
    plannedStayCities: [],
    tripStaySegments: [],
    plannedFlightLegs: [
      {
        id: "return-fco-ont",
        role: "return",
        fromIata: "FCO",
        toIata: "ONT",
        fromLabel: "Rome",
        toLabel: "Ontario",
        enabled: true,
        optional: false,
        departureDate: "2026-09-24",
        status: "needed",
      },
    ],
    transportReservations: [],
  });
  assert.ok(items.some((item) => item.kind === "flight" && item.label.includes("Rome")));
});

test("Europe 2026 accommodation gap includes hotel search context", () => {
  const gaps = detectTripGaps(
    [
      {
        id: "europe-as123",
        type: "flight",
        provider: "Alaska Airlines",
        localTime: "2026-09-01 18:00",
        timezone: "America/Los_Angeles",
        location: "ONT",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:00",
        confirmationCode: "ASBOOK1",
      },
      {
        id: "europe-as832",
        type: "flight",
        provider: "Alaska Airlines",
        localTime: "2026-09-14 13:05",
        timezone: "America/Los_Angeles",
        location: "FCO",
        flightDate: "2026-09-14",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-14 18:00",
        confirmationCode: "ASBOOK2",
      },
    ],
    EUROPE_NOW,
    { tripStartDate: "2026-09-01", tripEndDate: "2026-09-14" },
  );
  const stayGap = gaps.find((gap) => gap.id.startsWith("stay-gap-"));
  assert.ok(stayGap?.actionContext?.kind === "hotel");
  assert.ok(stayGap?.actionContext?.checkIn);
  assert.ok(stayGap?.actionContext?.checkOut);
});

test("Alaska forward html yields boarding pass URL for check-in handoff", () => {
  const html = `
    <p>Confirmation ABC123</p>
    <a href="https://www.alaskaair.com/booking/ABC123">Manage your trip</a>
    <a href="https://www.alaskaair.com/boarding/ABC123">View mobile boarding pass</a>
  `;
  const passUrl = resolveBoardingPassUrl({
    sourceLinks: extractReservationSourceLinks({ html, type: "flight" }),
    html,
  });
  assert.match(passUrl ?? "", /alaskaair\.com\/boarding/i);
});
