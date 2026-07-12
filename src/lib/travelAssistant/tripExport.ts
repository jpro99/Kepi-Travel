import type { TravelTrip } from "@/lib/travelAssistant/tripStore";

export interface TripExportPayload {
  format: "kepi-trip-v1";
  exportedAt: string;
  trip: TravelTrip;
}

/** Build a portable JSON snapshot of a full trip for download / backup. */
export function buildTripExportPayload(trip: TravelTrip): TripExportPayload {
  return {
    format: "kepi-trip-v1",
    exportedAt: new Date().toISOString(),
    trip,
  };
}

export function tripExportFilename(tripName: string, exportedAt = new Date()): string {
  const safe = tripName
    .trim()
    .replace(/[^\w\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .slice(0, 48) || "kepi-trip";
  const stamp = exportedAt.toISOString().slice(0, 10);
  return `${safe}-${stamp}.json`;
}

export function downloadTripJson(trip: TravelTrip): void {
  if (typeof window === "undefined") return;
  const payload = buildTripExportPayload(trip);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = tripExportFilename(trip.name);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
