import type { OfflineOutboxSnapshot } from "@/lib/travelAssistant/offlineOutbox";
import type { TripFlowStage } from "@/lib/travelAssistant/tripFlowControls";

export interface SessionReservation {
  id: string;
  type: "flight" | "hotel" | "train" | "ride" | "dinner";
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  assignedTo: string[];
  stage: TripFlowStage;
  critical: boolean;
  confidence: "high" | "medium" | "low";
  notes: string;
  source: "imported" | "manual" | "review-accepted";
}

export interface SessionReviewItem {
  id: string;
  reasons: string[];
  impact: string;
  sourceEmailSubject: string;
  draft: Omit<SessionReservation, "id" | "source">;
}

export interface SessionReadinessItem {
  id: string;
  category: string;
  title: string;
  complete: boolean;
  required: boolean;
}

export interface TravelClientSessionSnapshot {
  version: 1;
  savedAt: string;
  tripStage: TripFlowStage;
  tripStatus: "green" | "yellow" | "red";
  networkMode: "wifi" | "cellular" | "offline";
  wifiOnlySync: boolean;
  allowCellularLocationUpdates: boolean;
  showFamilyMap: boolean;
  selectedFamilyMemberId: string;
  personalTimelineOnly: boolean;
  guidanceTone: "subtle" | "standard";
  stageFocusMode: boolean;
  offlineOutbox: OfflineOutboxSnapshot;
  reservations: SessionReservation[];
  reviewQueue: SessionReviewItem[];
  readinessItems: SessionReadinessItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReservation(value: unknown): value is SessionReservation {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.provider === "string" &&
    typeof value.localTime === "string" &&
    typeof value.timezone === "string" &&
    typeof value.location === "string" &&
    typeof value.confirmationCode === "string" &&
    Array.isArray(value.assignedTo) &&
    value.assignedTo.every((entry) => typeof entry === "string") &&
    typeof value.stage === "string" &&
    typeof value.critical === "boolean" &&
    typeof value.confidence === "string" &&
    typeof value.notes === "string" &&
    typeof value.source === "string"
  );
}

function isReviewItem(value: unknown): value is SessionReviewItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    Array.isArray(value.reasons) &&
    value.reasons.every((entry) => typeof entry === "string") &&
    typeof value.impact === "string" &&
    typeof value.sourceEmailSubject === "string" &&
    isRecord(value.draft)
  );
}

function isReadinessItem(value: unknown): value is SessionReadinessItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.category === "string" &&
    typeof value.title === "string" &&
    typeof value.complete === "boolean" &&
    typeof value.required === "boolean"
  );
}

function isOfflineOutbox(value: unknown): value is OfflineOutboxSnapshot {
  if (!isRecord(value) || !Array.isArray(value.entries)) return false;
  return value.entries.every((entry) => {
    if (!isRecord(entry)) return false;
    return (
      typeof entry.id === "string" &&
      typeof entry.key === "string" &&
      typeof entry.message === "string" &&
      typeof entry.fingerprint === "string" &&
      (typeof entry.reservationId === "string" || entry.reservationId === null) &&
      typeof entry.createdAt === "string" &&
      typeof entry.status === "string" &&
      typeof entry.attempts === "number" &&
      (typeof entry.lastAttemptAt === "string" || entry.lastAttemptAt === null) &&
      (typeof entry.nextAttemptAt === "string" || entry.nextAttemptAt === null) &&
      (typeof entry.syncedAt === "string" || entry.syncedAt === null) &&
      (typeof entry.error === "string" || entry.error === null)
    );
  });
}

export function parseTravelClientSessionState(raw: string): TravelClientSessionSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    if (parsed.version !== 1) return null;
    if (typeof parsed.savedAt !== "string") return null;
    if (typeof parsed.tripStage !== "string") return null;
    if (typeof parsed.tripStatus !== "string") return null;
    if (typeof parsed.networkMode !== "string") return null;
    if (typeof parsed.wifiOnlySync !== "boolean") return null;
    if (typeof parsed.allowCellularLocationUpdates !== "boolean") return null;
    if (typeof parsed.showFamilyMap !== "boolean") return null;
    if (typeof parsed.selectedFamilyMemberId !== "string") return null;
    if (typeof parsed.personalTimelineOnly !== "boolean") return null;
    if (typeof parsed.guidanceTone !== "string") return null;
    if (typeof parsed.stageFocusMode !== "boolean") return null;
    if (!isOfflineOutbox(parsed.offlineOutbox)) return null;
    if (!Array.isArray(parsed.reservations) || !parsed.reservations.every(isReservation)) return null;
    if (!Array.isArray(parsed.reviewQueue) || !parsed.reviewQueue.every(isReviewItem)) return null;
    if (!Array.isArray(parsed.readinessItems) || !parsed.readinessItems.every(isReadinessItem)) return null;
    return {
      version: 1,
      savedAt: parsed.savedAt as string,
      tripStage: parsed.tripStage as TripFlowStage,
      tripStatus: parsed.tripStatus as "green" | "yellow" | "red",
      networkMode: parsed.networkMode as "wifi" | "cellular" | "offline",
      wifiOnlySync: parsed.wifiOnlySync as boolean,
      allowCellularLocationUpdates: parsed.allowCellularLocationUpdates as boolean,
      showFamilyMap: parsed.showFamilyMap as boolean,
      selectedFamilyMemberId: parsed.selectedFamilyMemberId as string,
      personalTimelineOnly: parsed.personalTimelineOnly as boolean,
      guidanceTone: parsed.guidanceTone as "subtle" | "standard",
      stageFocusMode: parsed.stageFocusMode as boolean,
      offlineOutbox: parsed.offlineOutbox as OfflineOutboxSnapshot,
      reservations: parsed.reservations as SessionReservation[],
      reviewQueue: parsed.reviewQueue as SessionReviewItem[],
      readinessItems: parsed.readinessItems as SessionReadinessItem[],
    };
  } catch {
    return null;
  }
}

export function stringifyTravelClientSessionState(snapshot: TravelClientSessionSnapshot): string {
  return JSON.stringify(snapshot);
}
