import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { logger } from "@/lib/logger";
import {
  setCalendarClientForTests,
  syncReservationToCalendar,
} from "@/lib/travelAssistant/calendarSyncService";

function createReservation(overrides?: Partial<{
  id: string;
  type: "flight" | "hotel" | "train" | "ride" | "dinner";
  title: string;
  confirmationCode: string;
  localTime: string;
  location: string;
  timezone: string;
  provider: string;
  notes: string;
}>) {
  return {
    id: overrides?.id ?? `reservation-${randomUUID()}`,
    type: overrides?.type ?? "flight",
    title: overrides?.title ?? "AA123 — JFK → LAX",
    confirmationCode: overrides?.confirmationCode ?? "AA12345",
    localTime: overrides?.localTime ?? "2026-07-22 08:15",
    location: overrides?.location ?? "JFK Terminal 8",
    timezone: overrides?.timezone ?? "America/New_York",
    provider: overrides?.provider ?? "American Airlines",
    notes: overrides?.notes ?? "Seat 12A",
  };
}

test("flight reservation creates calendar event with correct emoji and times", async () => {
  const inserts: Array<{ summary?: string | null; start?: { dateTime?: string | null }; end?: { dateTime?: string | null } }> = [];
  setCalendarClientForTests({
    events: {
      async list() {
        return { data: { items: [] } };
      },
      async insert(args) {
        inserts.push({
          summary: args.requestBody.summary,
          start: { dateTime: args.requestBody.start?.dateTime ?? null },
          end: { dateTime: args.requestBody.end?.dateTime ?? null },
        });
        return { data: { id: "event-flight-1" } };
      },
      async patch() {
        return { data: { id: "event-flight-1" } };
      },
      async delete() {
        return {};
      },
    },
  });

  try {
    const reservation = createReservation({
      id: `flight-${randomUUID()}`,
      type: "flight",
      title: "AA123 — JFK → LAX",
      localTime: "2026-08-10 09:30",
    });
    const result = await syncReservationToCalendar(`calendar-test-${randomUUID()}`, reservation);
    assert.equal(result.status, "created");
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0]?.summary, "✈️ Flight AA123 — JFK → LAX");
    assert.equal(inserts[0]?.start?.dateTime, "2026-08-10T09:30:00");
    assert.equal(inserts[0]?.end?.dateTime, "2026-08-10T11:30:00");
  } finally {
    setCalendarClientForTests(null);
  }
});

test("duplicate sync updates existing event instead of creating a second event", async () => {
  let insertCalls = 0;
  let patchCalls = 0;
  const userId = `calendar-duplicate-${randomUUID()}`;
  const reservation = createReservation({
    id: `dup-${randomUUID()}`,
    type: "train",
    title: "Northeast Regional 171",
  });

  setCalendarClientForTests({
    events: {
      async list() {
        return { data: { items: [] } };
      },
      async insert() {
        insertCalls += 1;
        return { data: { id: "event-duplicate-1" } };
      },
      async patch() {
        patchCalls += 1;
        return { data: { id: "event-duplicate-1" } };
      },
      async delete() {
        return {};
      },
    },
  });

  try {
    const first = await syncReservationToCalendar(userId, reservation);
    const second = await syncReservationToCalendar(userId, {
      ...reservation,
      notes: "Updated notes should patch existing event.",
    });

    assert.equal(first.status, "created");
    assert.equal(second.status, "updated");
    assert.equal(insertCalls, 1);
    assert.equal(patchCalls, 1);
  } finally {
    setCalendarClientForTests(null);
  }
});

test("calendar API failure logs warning without throwing", async () => {
  const userId = `calendar-failure-${randomUUID()}`;
  const reservation = createReservation({
    id: `fail-${randomUUID()}`,
    type: "ride",
  });
  const warningMessages: string[] = [];

  const loggerRef = logger as unknown as { warn: (message: string, meta?: Record<string, unknown>) => void };
  const originalWarn = loggerRef.warn;
  loggerRef.warn = (message) => {
    warningMessages.push(message);
  };

  setCalendarClientForTests({
    events: {
      async list() {
        return { data: { items: [] } };
      },
      async insert() {
        throw new Error("Calendar API unavailable");
      },
      async patch() {
        throw new Error("Should not patch");
      },
      async delete() {
        return {};
      },
    },
  });

  try {
    const result = await syncReservationToCalendar(userId, reservation);
    assert.equal(result.status, "failed");
    assert.match(warningMessages.join("\n"), /Calendar reservation sync failed/i);
  } finally {
    loggerRef.warn = originalWarn;
    setCalendarClientForTests(null);
  }
});
