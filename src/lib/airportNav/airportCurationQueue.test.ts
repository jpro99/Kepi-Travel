import assert from "node:assert/strict";
import test from "node:test";
import { buildNextAirportCurationRequest, hasArrivalsCoverage } from "@/lib/airportNav/airportCurationQueue";
import type { GraphNode } from "@/lib/airportNav/types";

test("a missing verified airport creates a curation request with its official source", () => {
  const request = buildNextAirportCurationRequest({
    iata: "HNL",
    now: new Date("2026-07-13T20:00:00.000Z"),
  });

  assert.equal(request.iata, "HNL");
  assert.equal(request.status, "requested");
  assert.equal(request.demandCount, 1);
  assert.equal(request.officialMapVerified, true);
  assert.equal(request.officialMapUrl, "https://airports.hawaii.gov/hnl/airport-map/");
});

test("repeated layout fetches within five minutes do not inflate demand", () => {
  const first = buildNextAirportCurationRequest({
    iata: "LAX",
    now: new Date("2026-07-13T20:00:00.000Z"),
  });
  const duplicate = buildNextAirportCurationRequest({
    iata: "LAX",
    existing: first,
    now: new Date("2026-07-13T20:04:59.000Z"),
  });
  const laterDemand = buildNextAirportCurationRequest({
    iata: "LAX",
    existing: duplicate,
    now: new Date("2026-07-13T20:10:00.000Z"),
  });

  assert.equal(duplicate.demandCount, 1);
  assert.equal(laterDemand.demandCount, 2);
});

test("demand sources dedupe and legacy fields carry forward", () => {
  const first = buildNextAirportCurationRequest({
    iata: "JFK",
    detectedBy: "layout-api",
    now: new Date("2026-07-13T20:00:00.000Z"),
  });
  const second = buildNextAirportCurationRequest({
    iata: "JFK",
    existing: { ...first, notes: "verify AirTrain link", linkedPackageRevision: 4 },
    detectedBy: "layout-api",
    now: new Date("2026-07-13T21:00:00.000Z"),
  });
  const third = buildNextAirportCurationRequest({
    iata: "JFK",
    existing: second,
    detectedBy: "offline-sync",
    now: new Date("2026-07-13T22:00:00.000Z"),
  });

  assert.deepEqual(second.detectedBy, ["layout-api"]);
  assert.deepEqual(third.detectedBy, ["layout-api", "offline-sync"]);
  assert.equal(third.notes, "verify AirTrain link");
  assert.equal(third.linkedPackageRevision, 4);
});

test("a published package remains published if an old client requests it", () => {
  const request = buildNextAirportCurationRequest({
    iata: "SEA",
    existing: {
      iata: "SEA",
      airportName: "Seattle-Tacoma International Airport",
      status: "published",
      demandCount: 7,
      firstRequestedAt: "2026-07-01T00:00:00.000Z",
      lastRequestedAt: "2026-07-01T00:00:00.000Z",
      officialMapUrl: "https://maps.flysea.org/",
      officialMapProvider: "SEA Airport",
      officialMapVerified: true,
    },
    now: new Date("2026-07-13T20:00:00.000Z"),
  });

  assert.equal(request.status, "published");
  assert.equal(request.demandCount, 8);
});

/**
 * M40 follow-up (2026-08-21) — arrivals is a second, independently-tracked
 * demand dimension. A departure layout existing (SEA/LAX-style) says nothing
 * about whether customs/baggage/ground-transport coverage exists too.
 */
test("hasArrivalsCoverage is false with no arrivals nodes, true with any one", () => {
  const gateOnly: GraphNode[] = [{ id: "g1", pos: [0, 0], kind: "gate", airside: true }];
  const withCustoms: GraphNode[] = [
    ...gateOnly,
    { id: "c1", pos: [0, 0], kind: "customs", airside: true },
  ];
  assert.equal(hasArrivalsCoverage({ nodes: gateOnly }), false);
  assert.equal(hasArrivalsCoverage({ nodes: withCustoms }), true);
});

test("arrivalsMissing flags a fresh request into arrivalsStatus 'requested'", () => {
  const request = buildNextAirportCurationRequest({
    iata: "LAX",
    arrivalsMissing: true,
    now: new Date("2026-08-21T20:00:00.000Z"),
  });

  assert.equal(request.arrivalsStatus, "requested");
  assert.equal(request.arrivalsDemandCount, 1);
});

test("repeated arrivals gaps within five minutes do not inflate arrivals demand", () => {
  const first = buildNextAirportCurationRequest({
    iata: "LAX",
    arrivalsMissing: true,
    now: new Date("2026-08-21T20:00:00.000Z"),
  });
  const duplicate = buildNextAirportCurationRequest({
    iata: "LAX",
    existing: first,
    arrivalsMissing: true,
    now: new Date("2026-08-21T20:04:59.000Z"),
  });
  const laterDemand = buildNextAirportCurationRequest({
    iata: "LAX",
    existing: duplicate,
    arrivalsMissing: true,
    now: new Date("2026-08-21T20:10:00.000Z"),
  });

  assert.equal(duplicate.arrivalsDemandCount, 1);
  assert.equal(laterDemand.arrivalsDemandCount, 2);
});

test("a published arrivalsStatus survives a stale arrivalsMissing re-check, and demand carries forward untouched when arrivals isn't flagged", () => {
  const published = buildNextAirportCurationRequest({
    iata: "LAX",
    existing: {
      iata: "LAX",
      airportName: "Los Angeles International Airport",
      status: "published",
      demandCount: 20,
      arrivalsStatus: "published",
      arrivalsDemandCount: 3,
      arrivalsLastRequestedAt: "2026-08-21T19:58:00.000Z", // within the 5-min dedup window
      firstRequestedAt: "2026-07-14T00:00:00.000Z",
      lastRequestedAt: "2026-07-14T00:00:00.000Z",
      officialMapUrl: null,
      officialMapProvider: null,
      officialMapVerified: false,
    },
    arrivalsMissing: true, // stale caller checking an old cached layout — must not downgrade
    now: new Date("2026-08-21T20:00:00.000Z"),
  });
  assert.equal(published.arrivalsStatus, "published");

  // Ordinary departure-only demand (arrivalsMissing absent) must not disturb
  // whatever arrivals state already existed.
  const departureOnlyPing = buildNextAirportCurationRequest({
    iata: "LAX",
    existing: published,
    now: new Date("2026-08-21T21:00:00.000Z"),
  });
  assert.equal(departureOnlyPing.arrivalsStatus, "published");
  assert.equal(departureOnlyPing.arrivalsDemandCount, 3);
});
