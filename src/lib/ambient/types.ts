// Live Activity / Dynamic Island payload — provenance-gated (Breakthrough A).

import type { FlightFactProvenance } from "@/lib/travelAssistant/dayOfDoorProvenance";
import type { UndyingRightsShell } from "@/lib/travelAssistant/provenanceChargeLiveActivity";

export interface LiveActivityData {
  /** Primary line (e.g. gate STRING). */
  primary: string;
  /** Secondary (countdown or status). */
  secondary: string;
  /** Tertiary status or rights headline. */
  tertiary: string;
  /** 0–1 progress when countdown is green; null otherwise. */
  progress: number | null;
  journeyState: string;
  /** Whether Dynamic Island may show departure countdown. */
  showCountdown: boolean;
  gateProvenance: FlightFactProvenance;
  statusProvenance: FlightFactProvenance;
  /** Cached EC261 coach shell — survives Home freeze. */
  rightsShell: UndyingRightsShell | null;
  webFallbackHonest: string;
}
