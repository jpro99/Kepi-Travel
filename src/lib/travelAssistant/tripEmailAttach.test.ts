import { describe, expect, it } from "vitest";
import {
  detectFlightScheduleChange,
  expandTripWindowIfNeeded,
  inferTripWindowFromDrafts,
} from "@/lib/travelAssistant/tripEmailAttach";
import { reservationWithinTripWindow } from "@/lib/travelAssistant/tripWindow";

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
});

describe("tripWindow padding", () => {
  it("allows reservations within padded window", () => {
    expect(reservationWithinTripWindow("2026-09-02", "2026-09-05", "2026-09-12")).toBe(true);
    expect(reservationWithinTripWindow("2026-08-20", "2026-09-05", "2026-09-12")).toBe(false);
  });
});
