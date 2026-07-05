import { describe, expect, it } from "vitest";
import {
  countDraftDatesInTripWindow,
  detectFlightScheduleChange,
  expandTripWindowIfNeeded,
  inferTripWindowFromDrafts,
  pickBestMatchingTripForDrafts,
} from "@/lib/travelAssistant/tripEmailAttach";
import type { TravelTrip } from "@/lib/travelAssistant/tripStore";
import { reservationWithinTripWindow } from "@/lib/travelAssistant/tripWindow";

function makeTrip(overrides: Partial<TravelTrip> & Pick<TravelTrip, "id" | "startDate" | "endDate">): TravelTrip {
  return {
    name: overrides.name ?? "Trip",
    destination: overrides.destination ?? "Honolulu",
    stage: "readiness",
    reservations: overrides.reservations ?? [],
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("tripEmailAttach", () => {
  it("infers trip window from flight drafts", () => {
    const inferred = inferTripWindowFromDrafts([
      { type: "flight", localTime: "2026-09-01 09:00", location: "IAH -> HNL" },
      { type: "flight", localTime: "2026-09-08 14:00", location: "HNL -> IAH" },
    ]);
    expect(inferred.startDate).toBe("2026-09-01");
    expect(inferred.endDate).toBe("2026-09-08");
    expect(inferred.destination).toContain("HNL");
  });

  it("expands trip window when reservation is outside configured dates", () => {
    const expanded = expandTripWindowIfNeeded(
      { startDate: "2026-09-01", endDate: "2026-09-05" },
      "2026-09-10",
    );
    expect(expanded).toEqual({ startDate: "2026-09-01", endDate: "2026-09-10" });
  });

  it("detects flight schedule changes", () => {
    const changes = detectFlightScheduleChange(
      {
        id: "1",
        type: "flight",
        title: "AS 832",
        provider: "Alaska",
        localTime: "2026-09-01 08:00",
        timezone: "UTC",
        location: "IAH-HNL",
        confirmationCode: "ABC",
        assignedTo: [],
        stage: "readiness",
        critical: true,
        confidence: "high",
        notes: "",
        source: "imported",
        flightDepartureTime: "2026-09-01 08:00",
        flightNumber: "AS832",
      },
      {
        id: "2",
        type: "flight",
        title: "AS 832",
        provider: "Alaska",
        localTime: "2026-09-01 10:30",
        timezone: "UTC",
        location: "IAH-HNL",
        confirmationCode: "ABC",
        assignedTo: [],
        stage: "readiness",
        critical: true,
        confidence: "high",
        notes: "",
        source: "imported",
        flightDepartureTime: "2026-09-01 10:30",
        flightNumber: "AS832",
      },
    );
    expect(changes).toContain("departure time");
  });

  it("picks the trip whose date window matches forwarded drafts", () => {
    const winterTrip = makeTrip({
      id: "winter",
      name: "Aspen ski trip",
      destination: "Aspen",
      startDate: "2026-12-20",
      endDate: "2026-12-27",
    });
    const summerTrip = makeTrip({
      id: "summer",
      name: "Hawaii summer",
      destination: "Honolulu",
      startDate: "2026-09-01",
      endDate: "2026-09-10",
    });
    const draftDates = ["2026-09-02", "2026-09-08"];

    expect(countDraftDatesInTripWindow(draftDates, winterTrip)).toBe(0);
    expect(countDraftDatesInTripWindow(draftDates, summerTrip)).toBe(2);

    const picked = pickBestMatchingTripForDrafts([winterTrip, summerTrip], draftDates, "winter");
    expect(picked?.id).toBe("summer");
  });

  it("does not return a trip when no draft dates overlap", () => {
    const winterTrip = makeTrip({
      id: "winter",
      name: "Aspen ski trip",
      destination: "Aspen",
      startDate: "2026-12-20",
      endDate: "2026-12-27",
    });
    expect(pickBestMatchingTripForDrafts([winterTrip], ["2026-09-02"], "winter")).toBeNull();
  });
});

describe("tripWindow padding", () => {
  it("allows reservations within padded window", () => {
    expect(reservationWithinTripWindow("2026-09-02", "2026-09-05", "2026-09-12")).toBe(true);
    expect(reservationWithinTripWindow("2026-08-20", "2026-09-05", "2026-09-12")).toBe(false);
  });
});
