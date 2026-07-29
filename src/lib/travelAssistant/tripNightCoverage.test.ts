import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTripCompleteness,
  buildTripNightCoverage,
  flightCoversNightAsAirborne,
  formatStayGapContextLabel,
  hotelCoversNight,
  shouldSkipPreDepartureHotelNag,
} from "@/lib/travelAssistant/tripNightCoverage";
import { detectTripGaps } from "@/lib/travelAssistant/gapDetectionService";

const nowMs = Date.parse("2026-07-28T12:00:00Z");

test("hotel covers nights check-in inclusive, check-out exclusive", () => {
  const hotel = {
    id: "h1",
    type: "hotel",
    localTime: "2026-09-12 15:00",
    checkOutDate: "2026-09-15",
  };
  assert.equal(hotelCoversNight(hotel, "2026-09-12"), true);
  assert.equal(hotelCoversNight(hotel, "2026-09-14"), true);
  assert.equal(hotelCoversNight(hotel, "2026-09-15"), false);
});

test("overnight long-haul marks Sep 1 as airborne, not a hotel night", () => {
  const flight = {
    id: "as180",
    type: "flight",
    localTime: "2026-09-01 17:30",
    flightDate: "2026-09-01",
    flightDepartureTime: "2026-09-01 17:30",
    flightArrivalTime: "2026-09-02 11:15",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "FCO",
  };
  assert.equal(flightCoversNightAsAirborne(flight, "2026-09-01"), true);
  assert.equal(flightCoversNightAsAirborne(flight, "2026-09-02"), false);
});

test("I34: Venice hotel does not hide Cortina/Ortisei nights Sep 15–17", () => {
  const coverage = buildTripNightCoverage({
    nowMs,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-18",
    reservations: [
      {
        id: "as654",
        type: "flight",
        localTime: "2026-09-01 12:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-01 14:30",
      },
      {
        id: "as180",
        type: "flight",
        localTime: "2026-09-01 17:30",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:15",
      },
      {
        id: "venice",
        type: "hotel",
        localTime: "2026-09-12 15:00",
        checkOutDate: "2026-09-15",
        location: "Venice",
        hotelSearchCity: "Venice",
      },
      {
        id: "train",
        type: "train",
        localTime: "2026-09-18 09:00",
        location: "Venice",
      },
    ],
  });

  // Same-day SEA connection must not start the sleep window on Sep 1.
  assert.equal(coverage.windowStart, "2026-09-02");
  const gapDates = coverage.nights.filter((n) => n.status === "gap").map((n) => n.dateKey);
  assert.ok(gapDates.includes("2026-09-15"));
  assert.ok(gapDates.includes("2026-09-16"));
  assert.ok(gapDates.includes("2026-09-17"));
  assert.ok(coverage.uncoveredRanges.some((r) => r.startNight <= "2026-09-15" && r.endNight >= "2026-09-17"));
});

test("I34: completeness label lists readable stay ranges, not MM-DD junk", () => {
  const completeness = buildTripCompleteness({
    nowMs,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-18",
    reservations: [
      {
        id: "as180",
        type: "flight",
        localTime: "2026-09-01 17:30",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:15",
      },
      {
        id: "venice",
        type: "hotel",
        localTime: "2026-09-12 15:00",
        checkOutDate: "2026-09-15",
        location: "Venice",
      },
    ],
  });
  assert.equal(completeness.hotels, "orange");
  assert.ok(completeness.hotelGaps.length >= 1);
  assert.match(completeness.hotelsLabel, /Sep/iu);
  assert.doesNotMatch(completeness.hotelsLabel, /09-01\s*-\s*09-01/u);
  assert.match(completeness.summary, /Tap Hotels/iu);
});

test("I41: Stay Gaps say After Venice checkout — not near Venice", () => {
  const coverage = buildTripNightCoverage({
    nowMs,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-25",
    reservations: [
      {
        id: "as180",
        type: "flight",
        localTime: "2026-09-01 17:30",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:15",
      },
      {
        id: "venice",
        type: "hotel",
        localTime: "2026-09-12 15:00",
        checkOutDate: "2026-09-15",
        location: "Venice",
      },
      {
        id: "return",
        type: "flight",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-25 18:00",
      },
    ],
  });
  const afterVenice = coverage.uncoveredRanges.find((r) => r.startNight === "2026-09-15");
  assert.ok(afterVenice);
  assert.equal(afterVenice!.gapContext, "after_checkout");
  assert.equal(formatStayGapContextLabel(afterVenice!), "After Venice checkout");
  assert.doesNotMatch(formatStayGapContextLabel(afterVenice!), /near Venice/i);
});

test("I40: blank AS180 arrival must not nag Sep 1 Polignano hotel while airborne", () => {
  const coverage = buildTripNightCoverage({
    nowMs,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-28",
    reservations: [
      {
        id: "as654",
        type: "flight",
        localTime: "2026-09-01 12:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-01 14:30",
      },
      {
        id: "as180",
        type: "flight",
        localTime: "2026-09-01 17:30",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        // Blank arrival — live bug that made Sep 1 a Stay Gap near Polignano.
        flightArrivalTime: "",
      },
      {
        id: "polignano",
        type: "hotel",
        localTime: "2026-09-02 15:00",
        checkOutDate: "2026-09-05",
        location: "Polignano a Mare",
      },
      {
        id: "return",
        type: "flight",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-25 18:00",
      },
    ],
  });
  assert.equal(coverage.windowStart, "2026-09-02");
  const gapDates = coverage.nights.filter((n) => n.status === "gap").map((n) => n.dateKey);
  assert.equal(gapDates.includes("2026-09-01"), false);
  assert.equal(
    coverage.nights.some((n) => n.dateKey === "2026-09-01"),
    false,
  );
});

test("I40: return flight caps Stay Gaps — no Sep 25–27 Munich after flying home", () => {
  const completeness = buildTripCompleteness({
    nowMs,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-28",
    reservations: [
      {
        id: "as180",
        type: "flight",
        localTime: "2026-09-01 17:30",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:15",
      },
      {
        id: "munich",
        type: "hotel",
        localTime: "2026-09-20 15:00",
        checkOutDate: "2026-09-25",
        location: "Munich",
      },
      {
        id: "return",
        type: "flight",
        localTime: "2026-09-25 10:00",
        flightDate: "2026-09-25",
        flightDepartureAirport: "MUC",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-25 18:00",
      },
    ],
  });
  assert.equal(
    completeness.hotelGaps.some(
      (g) => g.startNight <= "2026-09-25" && g.endNight >= "2026-09-25",
    ),
    false,
  );
  assert.equal(
    completeness.hotelGaps.some((g) => /Munich/i.test(g.suggestedCity) && g.startNight >= "2026-09-25"),
    false,
  );
});

test("I35: sleep window starts on first destination arrival — not hotel check-in before landing", () => {
  const coverage = buildTripNightCoverage({
    nowMs,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-25",
    reservations: [
      {
        id: "as654",
        type: "flight",
        localTime: "2026-09-01 12:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-01 14:30",
      },
      {
        id: "as180",
        type: "flight",
        localTime: "2026-09-01 17:30",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:15",
      },
      {
        // Wrong-year hotel must not pull window to Sep 1 after remap in callers;
        // coverage itself never seeds windowStart from hotels when flights exist.
        id: "nerea",
        type: "hotel",
        localTime: "2026-09-05 15:00",
        checkOutDate: "2026-09-08",
        location: "Monopoli",
      },
    ],
  });
  assert.equal(coverage.windowStart, "2026-09-02");
  const gapDates = coverage.nights.filter((n) => n.status === "gap").map((n) => n.dateKey);
  assert.equal(gapDates.includes("2026-09-01"), false);
  assert.ok(coverage.nights.some((n) => n.dateKey === "2026-09-05" && n.status === "covered"));
  assert.ok(coverage.nights.some((n) => n.dateKey === "2026-09-07" && n.status === "covered"));
  assert.ok(coverage.nights.some((n) => n.dateKey === "2026-09-08" && n.status === "gap"));
});

test("I34: first outbound night-before is home-base — no nag", () => {
  assert.equal(
    shouldSkipPreDepartureHotelNag({
      flightDay: "2026-09-01",
      nightBeforeKey: "2026-08-31",
      flightDepartureAirport: "ONT",
      firstOutboundAirport: "ONT",
      firstOutboundFlightDay: "2026-09-01",
      reservations: [],
    }),
    true,
  );
});

test("detectTripGaps surfaces stay-gap for empty Cortina nights and skips home-base", () => {
  const gaps = detectTripGaps(
    [
      {
        id: "as654",
        type: "flight",
        provider: "Alaska",
        localTime: "2026-09-01 12:00",
        location: "ONT",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "SEA",
        flightArrivalTime: "2026-09-01 14:30",
      },
      {
        id: "as180",
        type: "flight",
        provider: "Alaska",
        localTime: "2026-09-01 17:30",
        location: "SEA",
        flightDate: "2026-09-01",
        flightDepartureAirport: "SEA",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:15",
      },
      {
        id: "az",
        type: "flight",
        provider: "ITA",
        localTime: "2026-09-02 15:35",
        location: "FCO",
        flightDate: "2026-09-02",
        flightDepartureAirport: "FCO",
        flightArrivalAirport: "BRI",
        flightArrivalTime: "2026-09-02 16:40",
      },
      {
        id: "venice",
        type: "hotel",
        provider: "Airbnb",
        localTime: "2026-09-12 15:00",
        location: "Venice",
        checkOutDate: "2026-09-15",
      },
    ],
    nowMs,
    {
      tripStartDate: "2026-09-01",
      tripEndDate: "2026-09-18",
    },
  );

  assert.equal(
    gaps.some((g) => g.id.startsWith("no-hotel-night-before-2026-08-31") || g.id.includes("2026-08-31")),
    false,
  );
  assert.equal(gaps.some((g) => g.id === "no-hotel-night-before-2026-09-01"), false);
  assert.ok(gaps.some((g) => g.id.startsWith("stay-gap-") && /need a stay/iu.test(g.title)));
});

test("trip completeness turns hotels orange when nights are missing", () => {
  const completeness = buildTripCompleteness({
    nowMs,
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-18",
    reservations: [
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 12:00",
        flightDate: "2026-09-01",
        flightDepartureAirport: "ONT",
        flightArrivalAirport: "FCO",
        flightArrivalTime: "2026-09-02 11:00",
      },
      {
        id: "h1",
        type: "hotel",
        localTime: "2026-09-02 15:00",
        checkOutDate: "2026-09-10",
        location: "Monopoli",
      },
    ],
  });
  assert.equal(completeness.flights, "green");
  assert.equal(completeness.hotels, "orange");
  assert.equal(completeness.overall, "orange");
  assert.ok(completeness.firstHotelGap);
});
