import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveHomeLocationContext,
  stationToLocalHelpCity,
} from "@/lib/travelAssistant/resolveHomeLocationContext";

const EUROPE_WITH_LECCE = [
  {
    id: "lecce-hotel",
    type: "hotel",
    title: "Hotel Lecce",
    localTime: "2026-09-08 15:00",
    checkOutDate: "2026-09-10",
    location: "Lecce, Italy",
    confirmationCode: "LEC123",
  },
  {
    id: "bolzano-hotel",
    type: "hotel",
    title: "Hotel Greif",
    localTime: "2026-09-18 15:00",
    checkOutDate: "2026-09-19",
    location: "Bolzano, Italy",
    confirmationCode: "BOL456",
  },
];

test("G67: stationToLocalHelpCity maps München Hbf to Munich", () => {
  assert.equal(stationToLocalHelpCity("München Hbf"), "Munich");
  assert.equal(stationToLocalHelpCity("Bolzano / Bozen"), "Bolzano");
});

test("G67: Ask Kepi city follows today's stay — not first hotel in list (Lecce)", () => {
  const ctx = resolveHomeLocationContext({
    reservations: EUROPE_WITH_LECCE,
    stopRanges: [],
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-25",
    tripDestination: "Lecce",
    nowMs: Date.parse("2026-09-18T14:00:00Z"),
    timezone: "Europe/Rome",
  });
  assert.equal(ctx.displayCity, "Bolzano");
  assert.equal(ctx.source, "today_stay");
});

test("G67: train day Bolzano → München uses departure city before departure", () => {
  const ctx = resolveHomeLocationContext({
    reservations: [
      ...EUROPE_WITH_LECCE,
      {
        id: "rj86",
        type: "train",
        title: "Railjet 86",
        provider: "ÖBB",
        localTime: "2026-09-20 12:34",
        location: "Bolzano → München Hbf",
        trainNumber: "86",
        confirmationCode: "16085",
        originalEmailText: `RESERVIERUNG
Bolzano/Bozen 12:34
München Hbf 16:35`,
      },
    ],
    stopRanges: [],
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-25",
    tripDestination: "Lecce",
    nowMs: Date.parse("2026-09-20T08:00:00Z"),
    timezone: "Europe/Rome",
  });
  assert.equal(ctx.displayCity, "Bolzano");
  assert.equal(ctx.source, "today_train");
});

test("G67: train day uses Munich after scheduled arrival", () => {
  const ctx = resolveHomeLocationContext({
    reservations: [
      {
        id: "rj86",
        type: "train",
        title: "Railjet 86",
        localTime: "2026-09-20 12:34",
        location: "Bolzano → München Hbf",
        trainNumber: "86",
        confirmationCode: "16085",
        originalEmailText: `Bolzano/Bozen 12:34
München Hbf 16:35`,
      },
    ],
    stopRanges: [],
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-25",
    tripDestination: "Lecce",
    nowMs: Date.parse("2026-09-20T15:00:00Z"),
    timezone: "Europe/Rome",
  });
  assert.equal(ctx.displayCity, "Munich");
  assert.equal(ctx.source, "today_train");
});

test("G67: stop range wins when no hotel covers today", () => {
  const ctx = resolveHomeLocationContext({
    reservations: EUROPE_WITH_LECCE,
    stopRanges: [
      {
        checkIn: "2026-09-15",
        checkOut: "2026-09-17",
        nights: 2,
        stop: { name: "Venice" },
      },
    ],
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-25",
    tripDestination: "Lecce",
    nowMs: Date.parse("2026-09-15T12:00:00Z"),
    timezone: "Europe/Rome",
  });
  assert.equal(ctx.displayCity, "Venice");
  assert.equal(ctx.source, "stop_range");
});
