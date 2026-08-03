import test from "node:test";
import assert from "node:assert/strict";
import {
  airportCityLabel,
  buildBookAdvisorPicks,
  buildFlightCompareGoogleLabel,
  buildFlightQuoteDisclaimer,
  isTestOrFakeCarrier,
  resolveBookAdvisorOrigins,
  usdFromCashAmount,
} from "@/lib/flights/bookFlightAdvisorPicks";
import type { FusedOffer, FusedSearchResult } from "@/lib/flights/types";

function cashOffer(input: {
  id: string;
  origin: string;
  destination: string;
  amountCents: number;
  airlineName: string;
  carrier: string;
  stops?: number;
}): FusedOffer {
  const stops = input.stops ?? 0;
  const segments =
    stops === 0
      ? [
          {
            origin: input.origin,
            destination: input.destination,
            departingAt: "2026-09-13T16:00:00Z",
            arrivingAt: "2026-09-14T08:00:00Z",
            marketingCarrier: input.carrier,
            flightNumber: `${input.carrier}100`,
          },
        ]
      : [
          {
            origin: input.origin,
            destination: "SEA",
            departingAt: "2026-09-13T14:00:00Z",
            arrivingAt: "2026-09-13T17:00:00Z",
            marketingCarrier: input.carrier,
            flightNumber: `${input.carrier}1`,
          },
          {
            origin: "SEA",
            destination: input.destination,
            departingAt: "2026-09-13T19:00:00Z",
            arrivingAt: "2026-09-14T14:00:00Z",
            marketingCarrier: input.carrier,
            flightNumber: `${input.carrier}2`,
          },
        ];
  return {
    offer: {
      kind: "cash",
      id: input.id,
      totalAmount: input.amountCents,
      currency: "USD",
      cabin: "economy",
      segments,
      source: "duffel",
      airlineName: input.airlineName,
    },
    cashEquivalent: input.amountCents,
    isBestValue: false,
    metrics: { stops, durationMinutes: stops === 0 ? 600 : 900 },
    searchOrigin: input.origin,
    score: stops === 0 ? 90 : 70,
  };
}

function awardOffer(input: {
  id: string;
  origin: string;
  destination: string;
  program: "alaska" | "united";
  miles: number;
}): FusedOffer {
  return {
    offer: {
      kind: "award",
      id: input.id,
      program: input.program,
      milesCost: input.miles,
      cashSurcharge: 50,
      currency: "USD",
      cabin: "economy",
      segments: [
        {
          origin: input.origin,
          destination: input.destination,
          departingAt: "2026-09-13T16:00:00Z",
          arrivingAt: "2026-09-14T08:00:00Z",
          marketingCarrier: input.program === "alaska" ? "AS" : "UA",
          flightNumber: "AS180",
        },
      ],
      source: "seats_aero",
    },
    cashEquivalent: 40_000,
    isBestValue: false,
    reachable: true,
    metrics: { stops: 1, durationMinutes: 800 },
    searchOrigin: input.origin,
    score: 85,
  };
}

test("isTestOrFakeCarrier rejects Duffel Airways", () => {
  assert.equal(isTestOrFakeCarrier("Duffel Airways", "ZZ"), true);
  assert.equal(isTestOrFakeCarrier("American Airlines", "AA"), false);
});

test("resolveBookAdvisorOrigins puts requested first and adds PSP for SoCal", () => {
  const origins = resolveBookAdvisorOrigins("ONT", ["SNA", "LAX"]);
  assert.equal(origins[0], "ONT");
  assert.ok(origins.includes("PSP"), `expected PSP in ${origins.join(",")}`);
});

test("airportCityLabel resolves Palm Springs for PSP", () => {
  assert.match(airportCityLabel("PSP"), /Palm Springs/i);
});

test("F14: CTA labels never embed a dollar amount", () => {
  assert.equal(buildFlightCompareGoogleLabel(), "Compare on Google Flights ↗");
  assert.doesNotMatch(buildFlightCompareGoogleLabel(), /\$/);
  assert.match(buildFlightQuoteDisclaimer(691), /confirm on Google/i);
});

test("buildBookAdvisorPicks: ONT vs cheaper PSP cash + Alaska miles; filters Duffel", () => {
  const duffel = cashOffer({
    id: "fake",
    origin: "ONT",
    destination: "VCE",
    amountCents: 69_100,
    airlineName: "Duffel Airways",
    carrier: "ZZ",
  });
  duffel.score = 99;
  const ontCash = cashOffer({
    id: "ont-as",
    origin: "ONT",
    destination: "VCE",
    amountCents: 120_000,
    airlineName: "Alaska Airlines",
    carrier: "AS",
    stops: 1,
  });
  ontCash.score = 80;
  const pspCash = cashOffer({
    id: "psp-as",
    origin: "PSP",
    destination: "VCE",
    amountCents: 100_000,
    airlineName: "Alaska Airlines",
    carrier: "AS",
    stops: 1,
  });
  pspCash.score = 88;
  const alaskaAward = awardOffer({
    id: "award-as",
    origin: "ONT",
    destination: "VCE",
    program: "alaska",
    miles: 45_000,
  });
  alaskaAward.score = 92;

  const result: FusedSearchResult = {
    params: {
      origin: "ONT",
      destination: "VCE",
      departDate: "2026-09-13",
      returnDate: "2026-09-20",
      passengers: 1,
      cabin: "economy",
    },
    offers: [duffel, alaskaAward, pspCash, ontCash],
    cheapestCash: pspCash,
    bestAward: alaskaAward,
    originCashLeaderboard: [
      {
        origin: "PSP",
        totalAmount: 100_000,
        currency: "USD",
        airline: "Alaska Airlines",
        stops: 1,
        offerId: "psp-as",
        cabin: "economy",
        departureDate: "2026-09-13",
      },
      {
        origin: "ONT",
        totalAmount: 120_000,
        currency: "USD",
        airline: "Alaska Airlines",
        stops: 1,
        offerId: "ont-as",
        cabin: "economy",
        departureDate: "2026-09-13",
      },
    ],
    warnings: [],
    meta: {
      cashCount: 3,
      awardCount: 1,
      cashCached: false,
      awardCached: false,
      elapsedMs: 10,
      cashOriginsSearched: ["ONT", "PSP"],
      awardOriginsSearched: ["ONT", "PSP"],
      awardGatewaysSearched: [],
    },
  };

  const picks = buildBookAdvisorPicks({
    result,
    requestedOrigin: "ONT",
    preferAlaska: true,
  });

  assert.ok(!picks.some((p) => /duffel/i.test(p.airlineLabel)));
  assert.ok(picks.some((p) => p.kind === "overall"));
  const cash = picks.find((p) => p.kind === "cash");
  assert.ok(cash);
  assert.match(cash!.reason, /Palm Springs|PSP|\$20/i);
  assert.equal(cash!.originIata, "PSP");
  assert.equal(cash!.ctaLabel, "Compare on Google Flights ↗");
  assert.doesNotMatch(cash!.ctaLabel, /\$\d/);
  const miles = picks.find((p) => p.kind === "miles");
  assert.ok(miles);
  assert.equal(miles!.milesCost, 45_000);
  assert.equal(miles!.ctaKind, "seats");
});

test("usdFromCashAmount treats fused cents as dollars", () => {
  assert.equal(usdFromCashAmount(120_000), 1200);
  assert.equal(usdFromCashAmount(85), 85);
});
