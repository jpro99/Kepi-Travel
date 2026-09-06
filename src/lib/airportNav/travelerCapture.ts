import { normalizeGateString } from "@/lib/travelAssistant/bookedRemainingGateStation";
import type {
  TravelerCaptureRecord,
  TravelerCaptureSubmitInput,
} from "@/lib/airportNav/travelerCaptureTypes";
import { TRAVELER_CAPTURE_PROVENANCE } from "@/lib/airportNav/travelerCaptureTypes";
import { generateId } from "@/lib/utils/generateId";

export function sanitizeTravelerGateString(value: string | null | undefined): string | null {
  const normalized = normalizeGateString(value);
  return normalized.length > 0 ? normalized : null;
}

export function sanitizeTravelerNote(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

export function sanitizePinNote(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 200);
}

export function validateTravelerCaptureInput(input: TravelerCaptureSubmitInput): {
  ok: true;
  gateString: string | null;
  note: string | null;
  mapMark: TravelerCaptureRecord["mapMark"];
} | {
  ok: false;
  error: string;
} {
  const iata = (input.iata ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) {
    return { ok: false, error: "Airport IATA is required." };
  }
  const tripId = (input.tripId ?? "").trim();
  if (!tripId) {
    return { ok: false, error: "Trip id is required." };
  }

  const gateString = sanitizeTravelerGateString(input.gateString);
  const note = sanitizeTravelerNote(input.note);
  const mapMark =
    input.mapMark &&
    Number.isFinite(input.mapMark.lng) &&
    Number.isFinite(input.mapMark.lat)
      ? {
          lng: input.mapMark.lng,
          lat: input.mapMark.lat,
          accuracyM: input.mapMark.accuracyM ?? null,
          pinNote: sanitizePinNote(input.mapMark.pinNote),
        }
      : null;

  if (!gateString && !note && !mapMark) {
    return {
      ok: false,
      error: "Add a gate you see, drop a map mark, or write a short note.",
    };
  }

  return { ok: true, gateString, note, mapMark };
}

export function buildTravelerCaptureRecord(
  input: TravelerCaptureSubmitInput,
  options?: { syncStatus?: TravelerCaptureRecord["syncStatus"] },
): TravelerCaptureRecord {
  const validated = validateTravelerCaptureInput(input);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  return {
    id: generateId(),
    provenance: TRAVELER_CAPTURE_PROVENANCE,
    tripId: input.tripId.trim(),
    reservationId: input.reservationId ?? null,
    iata: input.iata.trim().toUpperCase(),
    gateString: validated.gateString,
    mapMark: validated.mapMark,
    note: validated.note,
    capturedAt: input.capturedAt?.trim() || new Date().toISOString(),
    syncStatus: options?.syncStatus ?? "pending",
    syncedAt: null,
    lastError: null,
  };
}

/** Facts-string line for Help — never claims official board data. */
export function formatTravelerCaptureFactsLine(
  capture: Pick<
    TravelerCaptureRecord,
    "iata" | "gateString" | "note" | "mapMark" | "capturedAt"
  > | null | undefined,
): string | null {
  if (!capture) return null;
  const parts: string[] = [];
  const iata = capture.iata?.trim().toUpperCase();
  if (iata) parts.push(`Airport ${iata}`);
  const gate = sanitizeTravelerGateString(capture.gateString);
  if (gate) parts.push(`traveler saw gate ${gate}`);
  const note = sanitizeTravelerNote(capture.note);
  if (note) parts.push(note);
  if (
    capture.mapMark &&
    Number.isFinite(capture.mapMark.lat) &&
    Number.isFinite(capture.mapMark.lng)
  ) {
    const pin = sanitizePinNote(capture.mapMark.pinNote);
    parts.push(
      pin
        ? `map mark ${capture.mapMark.lat.toFixed(5)},${capture.mapMark.lng.toFixed(5)} (${pin})`
        : `map mark ${capture.mapMark.lat.toFixed(5)},${capture.mapMark.lng.toFixed(5)}`,
    );
  }
  if (parts.length === 0) return null;
  return `TRAVELER_OBSERVED: ${parts.join(" · ")}`;
}
