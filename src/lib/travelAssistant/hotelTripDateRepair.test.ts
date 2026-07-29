import test from "node:test";
import assert from "node:assert/strict";
import {
  hotelCoversSleepNight,
  remapHotelDatesIntoTripWindow,
  reconcileStoredHotelReservations,
} from "@/lib/travelAssistant/hotelTripDateRepair";

test("I35: 2025 NEREA dates remap into Europe 2026 trip window", () => {
  const repaired = remapHotelDatesIntoTripWindow(
    {
      type: "hotel",
      localTime: "2025-09-05 15:00",
      checkOutDate: "2025-09-08",
      notes: "NEREA Monopoli",
    },
    "2026-09-01",
    "2026-09-25",
  );
  assert.equal(dateOnly(repaired.localTime), "2026-09-05");
  assert.equal(repaired.checkOutDate, "2026-09-08");
  assert.equal(hotelCoversSleepNight(repaired, "2026-09-05"), true);
  assert.equal(hotelCoversSleepNight(repaired, "2026-09-07"), true);
  assert.equal(hotelCoversSleepNight(repaired, "2026-09-08"), false);
});

test("I35: Ortisei Elvis 2025 remap covers Sep 18–19 only", () => {
  const repaired = remapHotelDatesIntoTripWindow(
    {
      type: "hotel",
      localTime: "2025-09-18 15:00",
      checkOutDate: "2025-09-20",
      location: "Ortisei",
    },
    "2026-09-01",
    "2026-09-25",
  );
  assert.equal(dateOnly(repaired.localTime), "2026-09-18");
  assert.equal(repaired.checkOutDate, "2026-09-20");
  assert.equal(hotelCoversSleepNight(repaired, "2026-09-17"), false);
  assert.equal(hotelCoversSleepNight(repaired, "2026-09-18"), true);
  assert.equal(hotelCoversSleepNight(repaired, "2026-09-19"), true);
  assert.equal(hotelCoversSleepNight(repaired, "2026-09-20"), false);
});

test("I35: reconcile only changes hotels that need remap", () => {
  const { reservations, changed } = reconcileStoredHotelReservations(
    [
      {
        id: "h1",
        type: "hotel",
        localTime: "2025-09-05 15:00",
        checkOutDate: "2025-09-08",
      },
      {
        id: "f1",
        type: "flight",
        localTime: "2026-09-01 12:00",
      },
    ],
    "2026-09-01",
    "2026-09-25",
  );
  assert.equal(changed, true);
  assert.equal(dateOnly(reservations[0]!.localTime), "2026-09-05");
  assert.equal(reservations[1]!.localTime, "2026-09-01 12:00");
});

function dateOnly(value?: string | null): string {
  return (value ?? "").trim().slice(0, 10);
}
