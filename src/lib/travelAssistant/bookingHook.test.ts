import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  BOOKING_HOOK_SENDER_HEADER,
  buildBookingHookEvents,
  dispatchBookingHookForNewlyPaid,
  extractOfficialStationsFromReservation,
  isPaidBookingReservation,
  postBookingHookEvent,
} from "./bookingHook";

function flightReservation(
  overrides: Partial<SessionReservation> & { id: string },
): SessionReservation {
  return {
    type: "flight",
    title: "SEA → FCO",
    provider: "Delta",
    localTime: "2026-09-01 10:00",
    timezone: "America/Los_Angeles",
    location: "SEA → FCO",
    confirmationCode: "ABC123",
    assignedTo: [],
    stage: "readiness",
    critical: true,
    confidence: "high",
    notes: "",
    source: "imported",
    flightDepartureAirport: "SEA",
    flightArrivalAirport: "FCO",
    ...overrides,
  };
}

function trainReservation(
  overrides: Partial<SessionReservation> & { id: string },
): SessionReservation {
  return {
    type: "train",
    title: "Frecciarossa 8812",
    provider: "Trenitalia",
    localTime: "2026-09-13 07:10",
    timezone: "Europe/Rome",
    location: "Lecce → Venezia S. Lucia",
    confirmationCode: "TR12345",
    assignedTo: [],
    stage: "readiness",
    critical: true,
    confidence: "high",
    notes: "",
    source: "imported",
    ...overrides,
  };
}

describe("bookingHook", () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.BOOKING_HOOK_URL;
  const originalKey = process.env.BOOKING_HOOK_SENDER_KEY;

  beforeEach(() => {
    process.env.BOOKING_HOOK_URL = "https://factory.example/hook";
    process.env.BOOKING_HOOK_SENDER_KEY = "test-sender-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.BOOKING_HOOK_URL = originalUrl;
    process.env.BOOKING_HOOK_SENDER_KEY = originalKey;
  });

  it("unpaid planned flight does not POST", async () => {
    const posts: unknown[] = [];
    globalThis.fetch = mock.fn(async (_url, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const unpaid = flightReservation({
      id: "res-planned",
      confirmationCode: "PLANNED",
      plannedOnly: true,
      flightDepartureAirport: "LAX",
      flightArrivalAirport: "SEA",
      location: "LAX → SEA",
    });

    assert.equal(isPaidBookingReservation(unpaid), false);
    assert.equal(buildBookingHookEvents(unpaid).length, 0);

    await dispatchBookingHookForNewlyPaid([], [unpaid]);
    assert.equal(posts.length, 0);
  });

  it("paid with only signed IATAs does not POST", async () => {
    const posts: unknown[] = [];
    globalThis.fetch = mock.fn(async (_url, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const paidSigned = flightReservation({
      id: "res-signed",
      flightDepartureAirport: "ONT",
      flightArrivalAirport: "SEA",
      location: "ONT → SEA",
    });

    await dispatchBookingHookForNewlyPaid([], [paidSigned]);
    assert.equal(posts.length, 0);
  });

  it("paid with a new official IATA POSTs once", async () => {
    const posts: unknown[] = [];
    let headerValue = "";
    globalThis.fetch = mock.fn(async (_url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      headerValue = headers?.[BOOKING_HOOK_SENDER_HEADER] ?? "";
      posts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const paidNew = flightReservation({
      id: "res-lax",
      flightDepartureAirport: "LAX",
      flightArrivalAirport: "FCO",
      location: "LAX → FCO",
      title: "LAX → FCO",
    });

    await dispatchBookingHookForNewlyPaid([], [paidNew]);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0], {
      paid: true,
      iata: "LAX",
      booking_id: "res-lax",
      timestamp: (posts[0] as { timestamp: string }).timestamp,
    });
    assert.equal(headerValue, "test-sender-key");
  });

  it("paid FCO→BRI POSTs BRI only (kac-0.1.1-bri is not a live sign)", async () => {
    const posts: unknown[] = [];
    globalThis.fetch = mock.fn(async (_url, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const paidBri = flightReservation({
      id: "res-fco-bri",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "BRI",
      location: "FCO → BRI",
      title: "AZ 1607 FCO → BRI",
    });

    await dispatchBookingHookForNewlyPaid([], [paidBri]);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0], {
      paid: true,
      iata: "BRI",
      booking_id: "res-fco-bri",
      timestamp: (posts[0] as { timestamp: string }).timestamp,
    });
  });

  it("paid VCE and MUC fire when official IATA fields are set", async () => {
    const posts: unknown[] = [];
    globalThis.fetch = mock.fn(async (_url, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const paidVce = flightReservation({
      id: "res-vce",
      flightDepartureAirport: "FCO",
      flightArrivalAirport: "VCE",
      location: "FCO → VCE",
    });

    const paidMuc = flightReservation({
      id: "res-muc",
      flightDepartureAirport: "MUC",
      flightArrivalAirport: "FCO",
      location: "MUC → FCO",
    });

    await dispatchBookingHookForNewlyPaid([], [paidVce]);
    await dispatchBookingHookForNewlyPaid([], [paidMuc]);

    assert.equal(posts.length, 2);
    assert.deepEqual(
      (posts as Array<{ iata?: string; booking_id: string }>).map((p) => ({
        iata: p.iata,
        booking_id: p.booking_id,
      })),
      [
        { iata: "VCE", booking_id: "res-vce" },
        { iata: "MUC", booking_id: "res-muc" },
      ],
    );
  });

  it("does not parse train stations from title or location free text", () => {
    const train = trainReservation({
      id: "res-venice",
      title: "Frecciarossa to Venezia S. Lucia",
      location: "Roma Termini → Venezia S. Lucia",
    });

    assert.equal(extractOfficialStationsFromReservation(train).length, 0);
    assert.equal(buildBookingHookEvents(train).length, 0);
  });

  it("signed Leonardo Express and Roma Termini skip; Fiumicino Aeroporto still fires", async () => {
    const posts: unknown[] = [];
    globalThis.fetch = mock.fn(async (_url, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const leonardo = trainReservation({
      id: "res-le",
      trainDepartureStation: "Fiumicino Aeroporto",
      trainArrivalStation: "Roma Termini",
    });

    await dispatchBookingHookForNewlyPaid([], [leonardo]);
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0], {
      paid: true,
      station: "Fiumicino Aeroporto",
      booking_id: "res-le",
      timestamp: (posts[0] as { timestamp: string }).timestamp,
    });
  });

  it("drops bus legs", async () => {
    const posts: unknown[] = [];
    globalThis.fetch = mock.fn(async (_url, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const busTrain = trainReservation({
      id: "res-bus",
      title: "Replacement bus after last train",
      location: "Roma Termini → Napoli Centrale",
      notes: "Trenitalia replacement bus service",
    });

    await dispatchBookingHookForNewlyPaid([], [busTrain]);
    assert.equal(posts.length, 0);
  });

  it("missing env does not throw", async () => {
    delete process.env.BOOKING_HOOK_URL;
    delete process.env.BOOKING_HOOK_SENDER_KEY;

    let fetchCalled = false;
    globalThis.fetch = mock.fn(async () => {
      fetchCalled = true;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    await postBookingHookEvent({
      paid: true,
      iata: "LAX",
      booking_id: "res-1",
      timestamp: new Date().toISOString(),
    });
    assert.equal(fetchCalled, false);
  });
});
