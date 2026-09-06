/** Traveler-observed airport marks — never official FIDS. */

export const TRAVELER_CAPTURE_PROVENANCE = "TRAVELER_OBSERVED" as const;

export type TravelerCaptureProvenance = typeof TRAVELER_CAPTURE_PROVENANCE;

export type TravelerCaptureSyncStatus = "pending" | "synced" | "failed";

export interface TravelerCaptureMapMark {
  lng: number;
  lat: number;
  accuracyM?: number | null;
  /** Optional note about where the pin was dropped (sign, column, etc.). */
  pinNote?: string | null;
}

export interface TravelerCaptureRecord {
  id: string;
  provenance: TravelerCaptureProvenance;
  tripId: string;
  reservationId?: string | null;
  iata: string;
  /** Gate STRING from a board or sign — never inferred by Kepi. */
  gateString?: string | null;
  mapMark?: TravelerCaptureMapMark | null;
  note?: string | null;
  /** True when a photo blob is stored locally in IndexedDB (may not be synced yet). */
  hasLocalPhoto?: boolean;
  capturedAt: string;
  syncStatus: TravelerCaptureSyncStatus;
  syncedAt?: string | null;
  lastError?: string | null;
}

export interface TravelerCaptureSubmitInput {
  /** Idempotent op id — client generates once per capture attempt. */
  id?: string;
  tripId: string;
  reservationId?: string | null;
  iata: string;
  gateString?: string | null;
  mapMark?: TravelerCaptureMapMark | null;
  note?: string | null;
  /** JPEG/PNG data URL — stored in IndexedDB; synced when small enough. */
  photoDataUrl?: string | null;
  capturedAt?: string;
}
