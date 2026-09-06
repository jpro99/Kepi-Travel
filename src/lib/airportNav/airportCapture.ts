import { normalizeGateString } from "@/lib/travelAssistant/bookedRemainingGateStation";
import type {
  AirportCaptureRecord,
  AirportCaptureSubmitInput,
} from "@/lib/airportNav/airportCaptureTypes";
import { AIRPORT_CAPTURE_PROVENANCE } from "@/lib/airportNav/airportCaptureTypes";
import { generateId } from "@/lib/utils/generateId";

export function sanitizeCaptureGateString(value: string | null | undefined): string | null {
  const normalized = normalizeGateString(value);
  return normalized.length > 0 ? normalized : null;
}

export function sanitizeCaptureNote(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

/** Max base64 payload ~300 KB — keeps localStorage queue durable on flaky networks. */
export const MAX_CAPTURE_PHOTO_CHARS = 320_000;

export function sanitizeCapturePhotoDataUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(trimmed)) return null;
  if (trimmed.length > MAX_CAPTURE_PHOTO_CHARS) return null;
  return trimmed;
}

export function validateAirportCaptureInput(input: AirportCaptureSubmitInput): {
  ok: true;
  gateString: string | null;
  note: string | null;
  photoDataUrl: string | null;
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

  const gateString = sanitizeCaptureGateString(input.gateString);
  const note = sanitizeCaptureNote(input.note);
  const photoDataUrl = sanitizeCapturePhotoDataUrl(input.photoDataUrl);
  const hasMapMark =
    input.mapMark != null &&
    Number.isFinite(input.mapMark.lng) &&
    Number.isFinite(input.mapMark.lat);

  if (!gateString && !note && !hasMapMark && !photoDataUrl) {
    return {
      ok: false,
      error: "Add a gate you see, a map mark, a note, or a photo.",
    };
  }

  return { ok: true, gateString, note, photoDataUrl };
}

export function buildLocalAirportCaptureRecord(
  input: AirportCaptureSubmitInput,
  options?: { userId?: string; syncStatus?: AirportCaptureRecord["syncStatus"] },
): AirportCaptureRecord {
  const validated = validateAirportCaptureInput(input);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const capturedAt = input.capturedAt?.trim() || new Date().toISOString();
  const mapMark =
    input.mapMark &&
    Number.isFinite(input.mapMark.lng) &&
    Number.isFinite(input.mapMark.lat)
      ? {
          lng: input.mapMark.lng,
          lat: input.mapMark.lat,
          nodeId: input.mapMark.nodeId ?? null,
          accuracyM: input.mapMark.accuracyM ?? null,
        }
      : null;

  return {
    id: generateId(),
    provenance: AIRPORT_CAPTURE_PROVENANCE,
    userId: options?.userId,
    tripId: input.tripId.trim(),
    reservationId: input.reservationId ?? null,
    iata: input.iata.trim().toUpperCase(),
    gateString: validated.gateString,
    mapMark,
    note: validated.note,
    photoDataUrl: validated.photoDataUrl,
    capturedAt,
    syncStatus: options?.syncStatus ?? "pending",
    syncedAt: null,
    lastError: null,
  };
}

export function formatTravelerObservedGateLine(
  capture: Pick<AirportCaptureRecord, "gateString" | "capturedAt"> | null | undefined,
  nowMs = Date.now(),
): string | null {
  const gate = sanitizeCaptureGateString(capture?.gateString);
  if (!gate) return null;
  const capturedAt = capture?.capturedAt?.trim();
  let suffix = "";
  if (capturedAt) {
    const ms = Date.parse(capturedAt);
    if (!Number.isNaN(ms)) {
      const minutesAgo = Math.max(0, Math.round((nowMs - ms) / 60_000));
      if (minutesAgo <= 1) suffix = " · you reported just now";
      else if (minutesAgo < 60) suffix = ` · you reported ${minutesAgo} min ago`;
      else suffix = ` · you reported ${Math.round(minutesAgo / 60)}h ago`;
    }
  }
  return `You reported gate ${gate}${suffix}`;
}

/** Latest traveler-observed gate per reservation — never overrides official FIDS text. */
export function indexTravelerObservedGates(
  captures: readonly AirportCaptureRecord[],
): Record<string, AirportCaptureRecord> {
  const out: Record<string, AirportCaptureRecord> = {};
  for (const capture of captures) {
    if (capture.provenance !== AIRPORT_CAPTURE_PROVENANCE) continue;
    const gate = sanitizeCaptureGateString(capture.gateString);
    if (!gate) continue;
    const key = capture.reservationId?.trim() || `${capture.tripId}:${capture.iata}`;
    const previous = out[key];
    if (!previous || Date.parse(capture.capturedAt) >= Date.parse(previous.capturedAt)) {
      out[key] = capture;
    }
  }
  return out;
}
