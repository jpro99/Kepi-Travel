import type { JourneyPhaseId } from "@/lib/airportNav/journeyMachine";

export type JourneyConfirmSource = "user" | "gps";

export interface FamilyMemberJourney {
  memberId: string;
  phase: JourneyPhaseId;
  enteredPhaseAt: string;
  confirmedBy: JourneyConfirmSource;
  throughSecurity: boolean;
}

export interface FamilyRallyTarget {
  kind: "gate" | "meetup";
  iata: string;
  label: string;
  gateCode?: string;
  poiId?: string;
}

export interface FamilyRally {
  id: string;
  tripId: string;
  groupId: string;
  createdBy: string;
  createdByName: string;
  status: "active" | "cancelled";
  target: FamilyRallyTarget;
  createdAt: string;
  message?: string;
}

export interface FamilyAirportSyncDocument {
  tripId: string;
  groupId: string;
  journeys: Record<string, FamilyMemberJourney>;
  rally: FamilyRally | null;
  updatedAt: string;
}

export const FAMILY_AIRPORT_SYNC_KEY = (tripId: string) => `family:airport-sync:${tripId}`;

const PHASE_ORDER: JourneyPhaseId[] = [
  "landside",
  "checkin",
  "security",
  "airside",
  "lounge",
  "at_gate",
  "boarding_soon",
  // Arrivals (added 2026-08-21, LAX pilot) — a later leg, so ranked last.
  "customs",
  "baggage_claim",
  "ground_transport",
];

export function humanJourneyPhaseLabel(phase: JourneyPhaseId): string {
  const labels: Record<JourneyPhaseId, string> = {
    landside: "Landside",
    checkin: "Check-in",
    security: "Security",
    airside: "Airside",
    lounge: "Lounge",
    at_gate: "At gate",
    boarding_soon: "Boarding",
    customs: "Customs",
    baggage_claim: "Baggage claim",
    ground_transport: "Ground transportation",
  };
  return labels[phase];
}

export function journeyPhaseRank(phase: JourneyPhaseId): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

export function buildMemberJourneyFromTap(
  phase: JourneyPhaseId,
  memberId: string,
  at = new Date().toISOString(),
): FamilyMemberJourney {
  const throughSecurity =
    phase === "airside" ||
    phase === "lounge" ||
    phase === "at_gate" ||
    phase === "boarding_soon";
  return {
    memberId,
    phase,
    enteredPhaseAt: at,
    confirmedBy: "user",
    throughSecurity,
  };
}

export function emptyAirportSyncDocument(tripId: string, groupId: string): FamilyAirportSyncDocument {
  return {
    tripId,
    groupId,
    journeys: {},
    rally: null,
    updatedAt: new Date().toISOString(),
  };
}

export function isClerkMemberId(memberId: string): boolean {
  return memberId.startsWith("user_");
}
