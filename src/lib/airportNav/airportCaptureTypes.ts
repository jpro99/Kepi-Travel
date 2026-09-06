/** Traveler-observed airport facts — never official FIDS (F17 capture lane). */

export const AIRPORT_CAPTURE_PROVENANCE = "TRAVELER_OBSERVED" as const;

export type AirportCaptureProvenance = typeof AIRPORT_CAPTURE_PROVENANCE;

export type AirportCaptureSyncStatus = "pending" | "synced" | "failed";

export interface AirportCaptureMapMark {
  lng: number;
  lat: number;
  nodeId?: string | null;
  accuracyM?: number | null;
}

export interface AirportCaptureRecord {
  id: string;
  provenance: AirportCaptureProvenance;
  userId?: string;
  tripId: string;
  reservationId?: string | null;
  iata: string;
  /** Gate STRING the traveler saw — never inferred by Kepi. */
  gateString?: string | null;
  mapMark?: AirportCaptureMapMark | null;
  note?: string | null;
  capturedAt: string;
  syncStatus: AirportCaptureSyncStatus;
  syncedAt?: string | null;
  lastError?: string | null;
}

export interface AirportCaptureSubmitInput {
  tripId: string;
  reservationId?: string | null;
  iata: string;
  gateString?: string | null;
  mapMark?: AirportCaptureMapMark | null;
  note?: string | null;
  capturedAt?: string;
}
