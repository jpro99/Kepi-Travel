import assert from "node:assert/strict";
import test from "node:test";
import { buildNextAirportCurationRequest } from "@/lib/airportNav/airportCurationQueue";

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
